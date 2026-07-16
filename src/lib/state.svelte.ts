/**
 * The single draft: one document, persisted to localStorage, editable
 * through whichever shell is active. Module-level runes state — never written
 * during SSR (all mutations originate from client events/effects).
 */
import { browser } from '$app/environment';
import { stripMarkers } from './markers';

export type ShellId = 'bare' | 'scratch' | 'pad' | 'term' | 'mail' | 'doc' | 'post' | 'yours';

const STORAGE_KEY = 'onesown:v1';
const SHELL_IDS: readonly ShellId[] = [
	'bare',
	'scratch',
	'pad',
	'term',
	'mail',
	'doc',
	'post',
	'yours'
];

type SaveState = 'idle' | 'pending' | 'saved' | 'error';

interface SaveFilePickerOptions {
	suggestedName?: string;
	types?: { description?: string; accept: Record<string, string[]> }[];
}

declare global {
	interface Window {
		showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
		showOpenFilePicker?: (options?: { multiple?: boolean }) => Promise<FileSystemFileHandle[]>;
	}
}

/** Refuse outright — past this the editor is unusable, not merely slow. */
const OPEN_MAX_BYTES = 500 * 1024;
/** Warn — typing measurably drags beyond roughly this much text. */
const OPEN_WARN_BYTES = 100 * 1024;

let text = $state('');
let shell = $state<ShellId>('bare');
let selStart = $state(0);
let selEnd = $state(0);
let wantsFocus = $state(false);
let saveState = $state<SaveState>('idle');
let diskNote = $state<string | null>(null);
/** Another tab holds a newer draft and this one has unsaved edits. See onStorage. */
let conflict = $state(false);

let loaded = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let diskNoteTimer: ReturnType<typeof setTimeout> | null = null;
let fileHandle: FileSystemFileHandle | null = null;

/**
 * Undo history.
 *
 * The draft is the spine that outlives every room, so its history has to as
 * well: a textarea's native undo stack dies with the element on each shell
 * switch. We own the stack instead, and the key handler suppresses the
 * browser's so the two can't disagree.
 */
interface Snapshot {
	text: string;
	selStart: number;
	selEnd: number;
}

/** A pause longer than this starts a new undo entry; faster keystrokes merge. */
const COALESCE_MS = 500;
const MAX_HISTORY = 100;
/** Snapshots hold whole copies of the draft — bound the total, not just the count. */
const MAX_HISTORY_CHARS = 4_000_000;

let past = $state<Snapshot[]>([]);
let future = $state<Snapshot[]>([]);
let lastEditAt = 0;
let justCleared = $state(false);
/**
 * What Clear wiped, held for the offer that follows it. The offer restores
 * *this*, not `past.pop()`: clearing resets the coalescing clock, so the first
 * keystroke after a clear pushes its own entry and a generic undo would peel
 * that off instead — leaving the draft empty under a button that just promised
 * otherwise. Held as the snapshot rather than an index into `past`, which
 * trimHistory shifts out from under us.
 */
let clearedSnapshot: Snapshot | null = null;
/**
 * Whether the offer still fits beside the draft. Latched false the first time
 * writing both overflows, so a doomed double write is attempted once and not
 * on every keystroke thereafter. The draft is what must fit; the offer is a
 * courtesy, and a courtesy that costs someone their draft is not one.
 */
let clearedFits = true;

/**
 * The offer as read back off disk, or null if there isn't a usable one.
 *
 * Empty text returns null so an offer that offers nothing can never reach the
 * screen, and the selection is clamped to the text it belongs to: this is
 * data that has been outside the program, and it comes back as whatever is in
 * the key by the time we read it.
 */
function readCleared(v: unknown): Snapshot | null {
	if (!v || typeof v !== 'object') return null;
	const c = v as Record<string, unknown>;
	if (typeof c.text !== 'string' || c.text === '') return null;
	const n = c.text.length;
	const at = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= n ? x : n);
	return { text: c.text, selStart: at(c.selStart), selEnd: at(c.selEnd) };
}

function snapshot(): Snapshot {
	return { text, selStart, selEnd };
}

function applySnapshot(s: Snapshot) {
	text = s.text;
	selStart = s.selStart;
	selEnd = s.selEnd;
	wantsFocus = true;
	lastEditAt = 0;
	if (browser && loaded) persist();
}

function trimHistory() {
	while (past.length > MAX_HISTORY) past.shift();
	let total = 0;
	for (const s of past) total += s.text.length;
	while (past.length > 1 && total > MAX_HISTORY_CHARS) {
		total -= past[0].text.length;
		past.shift();
	}
}

/**
 * Record the pre-edit state so undo can return to it. Call before mutating.
 * `discrete` forces its own entry for one-shot changes (Clear, opening a file)
 * that should never merge into surrounding typing.
 */
function recordEdit(discrete = false) {
	const now = Date.now();
	const startsGroup = discrete || past.length === 0 || now - lastEditAt > COALESCE_MS;
	lastEditAt = discrete ? 0 : now;
	future = [];
	if (!startsGroup) return;
	past.push(snapshot());
	trimHistory();
}

function undo() {
	if (past.length === 0) return false;
	future.push(snapshot());
	// Retire the offer BEFORE applying: applySnapshot persists, so dismissing
	// afterwards would write the record with the offer still in it and drop it
	// from memory only — the offer would come back on the next reload, to undo
	// a clear that has already been undone.
	dismissCleared();
	applySnapshot(past.pop()!);
	return true;
}

function redo() {
	if (future.length === 0) return false;
	past.push(snapshot());
	applySnapshot(future.pop()!);
	return true;
}

/**
 * Drop the offer in memory. Deliberately does NOT persist: onStorage uses it
 * while adopting another tab's draft and must not echo a write back. Anything
 * that is a decision by the writer goes through refuseCleared().
 */
function dismissCleared() {
	justCleared = false;
	clearedSnapshot = null;
	clearedFits = true;
}

/**
 * The way back from Clear — what the visible offer calls, and deliberately not
 * `undo()`. Restoring is itself an ordinary edit, so it lands on the undo stack
 * and can be walked back out of like any other.
 */
function restoreCleared() {
	if (!clearedSnapshot) return false;
	// Held by value, so retiring the offer first is safe — and it must be first:
	// applySnapshot persists, and dismissing after it would leave the offer on
	// disk to be found again next session. See undo().
	const restore = clearedSnapshot;
	recordEdit(true);
	dismissCleared();
	applySnapshot(restore);
	return true;
}

/**
 * The writer says no thanks. Separate from dismissCleared because that one is
 * also how an adopting tab drops an offer it is about to re-read, and must not
 * write; this one is a decision, and decisions are worth remembering.
 */
function refuseCleared() {
	dismissCleared();
	if (browser && loaded) persist();
}

function scheduleSave() {
	if (!browser || !loaded) return;
	saveState = 'pending';
	if (saveTimer) clearTimeout(saveTimer);
	saveTimer = setTimeout(persist, 600);
}

function persist() {
	if (!browser) return;
	if (saveTimer) clearTimeout(saveTimer);
	saveTimer = null;
	// Another tab wrote a draft this tab never saw, and this tab has edits of its
	// own. There is no sensible merge of two plain strings, so refuse to write
	// rather than silently flatten one of them — keepThisCopy() is the way out.
	if (conflict) return;
	const base = { v: 1, text, shell, savedAt: Date.now() };
	// The offer rides along in the draft's own record, and is the first thing
	// dropped if the two together will not fit. It is additive, so `v` stays 1:
	// an older build ignores the field, and this one reading an older record
	// finds undefined. Nothing to migrate.
	if (justCleared && clearedSnapshot && clearedFits) {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...base, cleared: clearedSnapshot }));
			saveState = 'saved';
			return;
		} catch {
			clearedFits = false;
		}
	}
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(base));
		saveState = 'saved';
	} catch {
		saveState = 'error';
	}
}

/**
 * Another tab wrote the shared draft.
 *
 * `persist()` blind-writes this tab's in-memory text, so before this a stale tab
 * would flatten a newer draft on the next thing that scheduled a save — a room
 * tab click was enough. Adopt when this tab has nothing pending (the writer just
 * sees their words arrive); otherwise hold both copies and say so.
 */
function onStorage(e: StorageEvent) {
	if (e.key !== STORAGE_KEY || e.newValue === null || conflict) return;
	let d: Record<string, unknown>;
	try {
		d = JSON.parse(e.newValue) as Record<string, unknown>;
	} catch {
		return;
	}
	if (typeof d.text !== 'string') return;
	if (saveTimer) {
		// We have unsaved edits of our own — nothing here is safe to throw away.
		conflict = true;
		clearTimeout(saveTimer);
		saveTimer = null;
		return;
	}
	if (d.text === text) return;
	// Assign the module state directly, never through the doc.* setters: those
	// recordEdit() and scheduleSave(), which would pollute undo and echo this
	// tab's adoption straight back out to the other one.
	text = d.text;
	selStart = Math.min(selStart, text.length);
	selEnd = Math.min(selEnd, text.length);
	// Our history describes a draft that no longer exists anywhere. Keeping it
	// would let ⌘Z resurrect it *over* the other tab's work — applySnapshot
	// persists — which is the very thing this listener exists to prevent.
	past = [];
	future = [];
	lastEditAt = 0;
	// Adopt the offer that came with the draft rather than dropping it. persist()
	// blind-writes this whole record, so a tab that adopted without it would
	// delete the other tab's way back on its very next save — from a listener
	// whose entire purpose is not losing anyone's words. Adopting also means the
	// tab watching another tab clear is offered the same way back.
	clearedSnapshot = readCleared(d.cleared);
	justCleared = clearedSnapshot !== null;
	clearedFits = true;
	saveState = 'saved';
}

/** Resolve a conflict this tab's way: its text wins and saving resumes. */
function keepThisCopy() {
	conflict = false;
	persist();
}

function load() {
	if (!browser || loaded) return;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			const d = JSON.parse(raw) as Record<string, unknown>;
			if (typeof d.text === 'string') text = d.text;
			if (typeof d.shell === 'string' && (SHELL_IDS as readonly string[]).includes(d.shell)) {
				shell = d.shell as ShellId;
			}
			// The confirm says "you can undo". It was true until the tab closed, and
			// then it quietly wasn't: the offer lived in module state and the words
			// were nowhere on disk. Clearing a draft and shutting the laptop is not
			// an exotic sequence — it is the most ordinary way to walk away from a
			// mistake, and it was the one path where the promise did not hold.
			clearedSnapshot = readCleared(d.cleared);
			justCleared = clearedSnapshot !== null;
		}
	} catch {
		// corrupted draft — start fresh rather than crash
	}
	loaded = true;
	if (text) saveState = 'saved';
	// The draft is one string shared by every tab on this origin, and persist()
	// does not re-read before writing — so a tab has to be told when the shared
	// copy moves underneath it.
	window.addEventListener('storage', onStorage);
}

function flush() {
	if (saveTimer) {
		clearTimeout(saveTimer);
		persist();
	}
}

function setSelection(start: number, end: number) {
	selStart = start;
	selEnd = end;
}

function switchShell(next: ShellId) {
	if (next === shell) return;
	shell = next;
	wantsFocus = true;
	scheduleSave();
}

/**
 * `offer` is whether the way back should be held out afterwards. It is decided
 * here rather than by a call after the fact because this function persists: set
 * from outside, the flag arrived after the write and the offer never reached
 * disk at all, so closing the tab took it with no sign it had been there.
 */
function clearDraft(offer = false) {
	const wiped = snapshot();
	recordEdit(true);
	text = '';
	selStart = 0;
	selEnd = 0;
	fileHandle = null;
	justCleared = offer && wiped.text !== '';
	clearedSnapshot = justCleared ? wiped : null;
	clearedFits = true;
	if (browser && loaded) persist();
	saveState = 'idle';
	wantsFocus = true;
}

/**
 * Shared clear flow: skip the confirm only when nothing would be lost.
 * Returns whether the draft was actually cleared. Undoable, but the confirm
 * stays — the note offering it expires, and losing a draft is unforgiving.
 */
function requestClear(): boolean {
	if (text === '') {
		clearDraft();
		return true;
	}
	if (!window.confirm('Clear the draft? This wipes the locally saved copy too — you can undo.')) {
		return false;
	}
	clearDraft(true);
	return true;
}

/** Replace the whole draft (opening a file) as one discrete undo entry. */
function replaceText(next: string) {
	recordEdit(true);
	text = next;
	selStart = 0;
	selEnd = 0;
	fileHandle = null;
	wantsFocus = true;
	if (browser && loaded) persist();
}

function noteDisk(message: string) {
	diskNote = message;
	if (diskNoteTimer) clearTimeout(diskNoteTimer);
	diskNoteTimer = setTimeout(() => (diskNote = null), 3000);
}

/**
 * The draft's own name, taken from its first line — the only place a draft that
 * is deliberately never titled can have one. ⌘S slugifies it into a filename;
 * printing puts it in document.title, which is what the browser prints in its
 * header and what Save-as-PDF offers as the filename.
 */
function titleOf() {
	return stripMarkers(text.split('\n')[0] ?? '').trim().slice(0, 60) || 'draft';
}

function suggestedName() {
	const slug = titleOf()
		.slice(0, 40)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return `${slug || 'draft'}.txt`;
}

async function saveToDisk() {
	if (!browser) return;
	flush();
	if (typeof window.showSaveFilePicker === 'function') {
		try {
			if (!fileHandle) {
				fileHandle = await window.showSaveFilePicker({
					suggestedName: suggestedName(),
					types: [{ description: 'Plain text', accept: { 'text/plain': ['.txt', '.md'] } }]
				});
			}
			const writable = await fileHandle.createWritable();
			await writable.write(text);
			await writable.close();
			noteDisk(`Saved to ${fileHandle.name}`);
		} catch (e) {
			if (e instanceof DOMException && e.name === 'AbortError') return;
			fileHandle = null;
			noteDisk('Save failed — try again');
		}
	} else {
		const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = suggestedName();
		a.click();
		URL.revokeObjectURL(url);
		noteDisk('Downloaded as .txt');
	}
}

/** Browsers without the File System Access API (Firefox, Safari) get an input. */
function pickViaInput(): Promise<File | null> {
	return new Promise((resolve) => {
		const input = document.createElement('input');
		input.type = 'file';
		let settled = false;
		const done = (f: File | null) => {
			if (settled) return;
			settled = true;
			resolve(f);
		};
		input.onchange = () => done(input.files?.[0] ?? null);
		// Fires when the picker is dismissed; without it a cancel would hang forever.
		input.oncancel = () => done(null);
		input.click();
	});
}

/**
 * Open any file and read it as text. Deliberately liberal about type — a
 * draft is a draft whatever the extension — but size is the one hard line,
 * because the editor lays the whole draft out on every keystroke.
 */
async function openFromDisk() {
	if (!browser) return;
	let file: File | null = null;
	if (typeof window.showOpenFilePicker === 'function') {
		try {
			const [handle] = await window.showOpenFilePicker({ multiple: false });
			file = await handle.getFile();
		} catch (e) {
			if (e instanceof DOMException && e.name === 'AbortError') return;
			noteDisk('Couldn’t open that file');
			return;
		}
	} else {
		file = await pickViaInput();
	}
	if (!file) return;

	const kb = Math.round(file.size / 1024);
	if (file.size > OPEN_MAX_BYTES) {
		noteDisk(`${kb} KB is too big — 500 KB max`);
		return;
	}

	let raw: string;
	try {
		raw = await file.text();
	} catch {
		noteDisk('Couldn’t read that file');
		return;
	}

	// Warn about anything surprising, but in one prompt rather than three.
	const warnings: string[] = [];
	// A NUL byte in the first few KB means this is almost certainly not text.
	if (raw.slice(0, 4096).includes('\u0000')) warnings.push('It doesn’t look like text.');
	if (file.size > OPEN_WARN_BYTES) warnings.push(`It’s ${kb} KB — typing may lag.`);
	if (text !== '') warnings.push('This replaces your draft (undo brings it back).');
	if (warnings.length > 0 && !window.confirm(`Open ${file.name}?\n\n${warnings.join('\n')}`)) return;

	replaceText(raw);
	noteDisk(`Opened ${file.name}`);
}

export const doc = {
	get text() {
		return text;
	},
	set text(v: string) {
		if (v === text) return;
		recordEdit();
		text = v;
		scheduleSave();
	},
	get shell() {
		return shell;
	},
	get selStart() {
		return selStart;
	},
	get selEnd() {
		return selEnd;
	},
	get wantsFocus() {
		return wantsFocus;
	},
	set wantsFocus(v: boolean) {
		wantsFocus = v;
	},
	get saveState() {
		return saveState;
	},
	get diskNote() {
		return diskNote;
	},
	get conflict() {
		return conflict;
	},
	/** The draft's name, from its first line. See titleOf. */
	get title() {
		return titleOf();
	},
	get words() {
		const t = text.trim();
		return t === '' ? 0 : t.split(/\s+/).length;
	},
	get chars() {
		return text.length;
	},
	get line() {
		const s = Math.min(selStart, text.length);
		return text.slice(0, s).split('\n').length;
	},
	get col() {
		const s = Math.min(selStart, text.length);
		if (s === 0) return 1;
		return s - text.lastIndexOf('\n', s - 1);
	},
	get canUndo() {
		return past.length > 0;
	},
	get canRedo() {
		return future.length > 0;
	},
	get justCleared() {
		return justCleared;
	},
	load,
	flush,
	setSelection,
	switchShell,
	clearDraft,
	requestClear,
	replaceText,
	saveToDisk,
	openFromDisk,
	undo,
	redo,
	restoreCleared,
	refuseCleared,
	keepThisCopy,
	dismissCleared
};

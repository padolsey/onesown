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
	}
}

let text = $state('');
let shell = $state<ShellId>('bare');
let mailTo = $state('');
let mailSubject = $state('');
let mailCc = $state('');
let mailBcc = $state('');
let selStart = $state(0);
let selEnd = $state(0);
let wantsFocus = $state(false);
let saveState = $state<SaveState>('idle');
let diskNote = $state<string | null>(null);

let loaded = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let diskNoteTimer: ReturnType<typeof setTimeout> | null = null;
let fileHandle: FileSystemFileHandle | null = null;

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
	try {
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({ v: 1, text, shell, mailTo, mailSubject, mailCc, mailBcc, savedAt: Date.now() })
		);
		saveState = 'saved';
	} catch {
		saveState = 'error';
	}
}

function load() {
	if (!browser || loaded) return;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			const d = JSON.parse(raw) as Record<string, unknown>;
			if (typeof d.text === 'string') text = d.text;
			if (typeof d.mailTo === 'string') mailTo = d.mailTo;
			if (typeof d.mailSubject === 'string') mailSubject = d.mailSubject;
			if (typeof d.mailCc === 'string') mailCc = d.mailCc;
			if (typeof d.mailBcc === 'string') mailBcc = d.mailBcc;
			if (typeof d.shell === 'string' && (SHELL_IDS as readonly string[]).includes(d.shell)) {
				shell = d.shell as ShellId;
			}
		}
	} catch {
		// corrupted draft — start fresh rather than crash
	}
	loaded = true;
	if (text) saveState = 'saved';
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

function clearDraft() {
	text = '';
	mailTo = '';
	mailSubject = '';
	mailCc = '';
	mailBcc = '';
	selStart = 0;
	selEnd = 0;
	fileHandle = null;
	if (browser && loaded) persist();
	saveState = 'idle';
	wantsFocus = true;
}

/** Shared clear flow: skip the confirm only when nothing would be lost. */
function requestClear() {
	const empty =
		text === '' && mailTo === '' && mailSubject === '' && mailCc === '' && mailBcc === '';
	if (empty || window.confirm('Clear the draft? This wipes the locally saved copy too.')) {
		clearDraft();
	}
}

function noteDisk(message: string) {
	diskNote = message;
	if (diskNoteTimer) clearTimeout(diskNoteTimer);
	diskNoteTimer = setTimeout(() => (diskNote = null), 3000);
}

function suggestedName() {
	const firstLine = stripMarkers(text.split('\n')[0] ?? '');
	const slug = firstLine
		.trim()
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

export const doc = {
	get text() {
		return text;
	},
	set text(v: string) {
		text = v;
		scheduleSave();
	},
	get shell() {
		return shell;
	},
	get mailTo() {
		return mailTo;
	},
	set mailTo(v: string) {
		mailTo = v;
		scheduleSave();
	},
	get mailSubject() {
		return mailSubject;
	},
	set mailSubject(v: string) {
		mailSubject = v;
		scheduleSave();
	},
	get mailCc() {
		return mailCc;
	},
	set mailCc(v: string) {
		mailCc = v;
		scheduleSave();
	},
	get mailBcc() {
		return mailBcc;
	},
	set mailBcc(v: string) {
		mailBcc = v;
		scheduleSave();
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
	load,
	flush,
	setSelection,
	switchShell,
	clearDraft,
	requestClear,
	saveToDisk
};

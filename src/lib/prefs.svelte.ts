/**
 * Writer preferences: theme override, word goal, room
 * flavor variants, and the "Yours" room's lighting. Persisted to localStorage
 * separately from the draft. `focus` is deliberately ephemeral — a session
 * posture, not a setting. Module-level runes state; never written during SSR.
 */
import { browser } from '$app/environment';

export type Theme = 'system' | 'light' | 'dark';
export type PadPaper = 'yellow' | 'white';
export type TermPhosphor = 'green' | 'amber';
export type PostLimit = 280 | 500;

/**
 * The Yours room.
 *
 * Paper and hue are stored; INK IS NEVER STORED. It is solved against the paper
 * at render time by src/lib/palette.ts, which is the whole reason this room can
 * be handed the keys: you choose a pigment's character and the room works out
 * what that pigment looks like on that paper. Storing an ink would be storing a
 * chance to make the text invisible, which is what the old room did — half its
 * pairs failed AA and `ink on dusk` rendered at 1.10:1.
 *
 * Both are hex, not names, because a photograph can make a paper no list
 * contains. The named rooms below are just tuples of the same two values.
 */
export interface YoursConfig {
	font: 'serif' | 'sans' | 'mono' | 'hand';
	/** Paper colour, hex. Any colour: a photo derives one. */
	paper: string;
	/** The pigment's character, hex. The ink shown is derived from this + paper. */
	hue: string;
	width: 'narrow' | 'wide';
	size: 's' | 'm' | 'l';
	/** Show the photograph behind the words. Its opacity is derived, never set. */
	wash: boolean;
	/** The photograph, as a downscaled data URI. blob: is blocked by the CSP. */
	photo: string | null;
}

export const YOURS_FONTS: Record<YoursConfig['font'], string> = {
	serif: "Georgia, 'Times New Roman', serif",
	sans: "system-ui, -apple-system, 'Segoe UI', sans-serif",
	mono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
	hand: "'Bradley Hand', 'Segoe Print', 'Comic Sans MS', 'Comic Neue', cursive"
};

/** Papers to start from. The engine will take any colour; these have taste. */
export const YOURS_PAPERS: { id: string; name: string; hex: string }[] = [
	{ id: 'cream', name: 'cream', hex: '#faf6ec' },
	{ id: 'white', name: 'white', hex: '#ffffff' },
	{ id: 'oat', name: 'oat', hex: '#ece4d4' },
	{ id: 'slate', name: 'slate', hex: '#23242a' },
	{ id: 'night', name: 'night', hex: '#0f0f11' }
];

/**
 * Pigments. A hue, not a colour — each of these renders dark on light paper and
 * pale on dark paper, because that is what pigment does.
 */
export const YOURS_HUES: { id: string; name: string; hex: string }[] = [
	{ id: 'ink', name: 'ink', hex: '#2f2b25' },
	{ id: 'plum', name: 'plum', hex: '#7a2f63' },
	{ id: 'moss', name: 'moss', hex: '#3f5f3a' },
	{ id: 'iron', name: 'iron', hex: '#3c4650' },
	{ id: 'sepia', name: 'sepia', hex: '#6b4a2f' },
	{ id: 'indigo', name: 'indigo', hex: '#2f3f8f' }
];

/**
 * Rooms with names. Not a ceiling — the pigments sit right beside them — but an
 * on-ramp: the other seven rooms work because someone with taste made the
 * choices, and arriving at 30 pigment combinations with none of them made is a
 * worse start than arriving at six rooms you can sit down in.
 */
export const YOURS_ROOMS: { name: string; paper: string; hue: string; font: YoursConfig['font'] }[] = [
	{ name: 'Study', paper: '#faf6ec', hue: '#2f2b25', font: 'serif' },
	{ name: 'Snow', paper: '#ffffff', hue: '#3c4650', font: 'sans' },
	{ name: 'Manuscript', paper: '#ece4d4', hue: '#6b4a2f', font: 'serif' },
	{ name: 'Greenroom', paper: '#1b241c', hue: '#3f5f3a', font: 'serif' },
	{ name: 'Blue Hour', paper: '#23242a', hue: '#2f3f8f', font: 'sans' },
	{ name: 'Lamplight', paper: '#0f0f11', hue: '#6b4a2f', font: 'serif' }
];

const KEY = 'onesown:prefs:v1';
const DEFAULT_YOURS: YoursConfig = {
	font: 'serif',
	paper: '#faf6ec',
	hue: '#2f2b25',
	width: 'narrow',
	size: 'm',
	wash: false,
	photo: null
};
/** A photograph is downscaled and re-encoded before it is stored; anything past
 *  this is not our file and does not belong in the writer's storage budget. */
const MAX_PHOTO_BYTES = 400_000;
const HEX = /^#[0-9a-f]{6}$/i;

let theme = $state<Theme>('system');
let goal = $state<number | null>(null);
let padPaper = $state<PadPaper>('yellow');
let termPhosphor = $state<TermPhosphor>('green');
let postLimit = $state<PostLimit>(280);
let yours = $state<YoursConfig>({ ...DEFAULT_YOURS });
/**
 * A room being tried on, not chosen. Reaching for a door in the popover makes
 * the room BE it, at full size, with the writer's own words in it; leaving puts
 * it back. Deliberately not persisted and deliberately never merged into
 * `yours` — it is a patch laid over the top, so trying costs nothing and undoes
 * itself. Same posture as `focus`: a gesture, not a setting.
 */
let previewYours = $state<Partial<YoursConfig> | null>(null);
let focus = $state(false);

let loaded = false;

function persist() {
	if (!browser || !loaded) return;
	try {
		localStorage.setItem(
			KEY,
			JSON.stringify({ v: 1, theme, goal, padPaper, termPhosphor, postLimit, yours })
		);
	} catch {
		// storage unavailable — preferences just won't survive the session
	}
}

function oneOf<T extends string | number>(value: unknown, allowed: readonly T[]): T | null {
	return allowed.includes(value as T) ? (value as T) : null;
}

function load() {
	if (!browser || loaded) return;
	try {
		const raw = localStorage.getItem(KEY);
		if (raw) {
			const d = JSON.parse(raw) as Record<string, unknown>;
			theme = oneOf(d.theme, ['system', 'light', 'dark'] as const) ?? 'system';
			goal = typeof d.goal === 'number' && d.goal > 0 ? Math.floor(d.goal) : null;
			padPaper = oneOf(d.padPaper, ['yellow', 'white'] as const) ?? 'yellow';
			termPhosphor = oneOf(d.termPhosphor, ['green', 'amber'] as const) ?? 'green';
			postLimit = oneOf(d.postLimit, [280, 500] as const) ?? 280;
			const y = (d.yours ?? {}) as Record<string, unknown>;
			// Paper and hue used to be names from a fixed list; they are hex now,
			// because a photograph makes colours no list contains. An old config
			// names a paper we still ship, so translate it rather than throwing the
			// writer's room away; anything unrecognised falls back.
			const LEGACY_PAPER: Record<string, string> = {
				cream: '#faf6ec',
				white: '#ffffff',
				dusk: '#23242a',
				night: '#0f0f11'
			};
			const LEGACY_INK: Record<string, string> = {
				ink: '#2f2b25',
				blue: '#2f3f8f',
				sepia: '#6b4a2f',
				chalk: '#3c4650' // chalk was a light ink; as a hue it is iron, and the
				// engine will make it pale again on dark paper by itself.
			};
			const hex = (v: unknown, legacy: Record<string, string>, fallback: string) =>
				typeof v === 'string' ? (HEX.test(v) ? v : (legacy[v] ?? fallback)) : fallback;
			// A photo is only ever written here after being downscaled and
			// re-encoded, so anything oversized or not a data: image came from
			// somewhere else and is refused rather than trusted.
			const photo =
				typeof y.photo === 'string' &&
				y.photo.startsWith('data:image/') &&
				y.photo.length <= MAX_PHOTO_BYTES
					? y.photo
					: null;
			yours = {
				font: oneOf(y.font, ['serif', 'sans', 'mono', 'hand'] as const) ?? DEFAULT_YOURS.font,
				paper: hex(y.paper, LEGACY_PAPER, DEFAULT_YOURS.paper),
				hue: hex(y.hue ?? y.ink, LEGACY_INK, DEFAULT_YOURS.hue),
				width: oneOf(y.width, ['narrow', 'wide'] as const) ?? DEFAULT_YOURS.width,
				size: oneOf(y.size, ['s', 'm', 'l'] as const) ?? DEFAULT_YOURS.size,
				wash: y.wash === true && photo !== null,
				photo
			};
		}
	} catch {
		// corrupted prefs — fall back to defaults
	}
	loaded = true;
}

export const prefs = {
	get theme() {
		return theme;
	},
	set theme(v: Theme) {
		theme = v;
		persist();
	},
	get goal() {
		return goal;
	},
	set goal(v: number | null) {
		goal = v && v > 0 ? Math.floor(v) : null;
		persist();
	},
	get padPaper() {
		return padPaper;
	},
	set padPaper(v: PadPaper) {
		padPaper = v;
		persist();
	},
	get termPhosphor() {
		return termPhosphor;
	},
	set termPhosphor(v: TermPhosphor) {
		termPhosphor = v;
		persist();
	},
	get postLimit() {
		return postLimit;
	},
	set postLimit(v: PostLimit) {
		postLimit = v;
		persist();
	},
	get yours() {
		return previewYours ? { ...yours, ...previewYours } : yours;
	},
	/** What is actually chosen, ignoring anything being tried on. */
	get yoursCommitted() {
		return yours;
	},
	get previewYours() {
		return previewYours;
	},
	set previewYours(v: Partial<YoursConfig> | null) {
		previewYours = v;
	},
	set yours(v: YoursConfig) {
		yours = v;
		persist();
	},
	get focus() {
		return focus;
	},
	set focus(v: boolean) {
		focus = v;
	},
	load
};

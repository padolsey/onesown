/**
 * Writer preferences: theme override, typewriter scrolling, word goal, room
 * flavor variants, and the "Yours" room's lighting. Persisted to localStorage
 * separately from the draft. `focus` is deliberately ephemeral — a session
 * posture, not a setting. Module-level runes state; never written during SSR.
 */
import { browser } from '$app/environment';

export type Theme = 'system' | 'light' | 'dark';
export type PadPaper = 'yellow' | 'white';
export type TermPhosphor = 'green' | 'amber';
export type PostLimit = 280 | 500;

export interface YoursConfig {
	font: 'serif' | 'sans' | 'mono' | 'hand';
	ink: 'ink' | 'blue' | 'sepia' | 'chalk';
	paper: 'cream' | 'white' | 'dusk' | 'night';
	width: 'narrow' | 'wide';
	size: 's' | 'm' | 'l';
}

export const YOURS_FONTS: Record<YoursConfig['font'], string> = {
	serif: "Georgia, 'Times New Roman', serif",
	sans: "system-ui, -apple-system, 'Segoe UI', sans-serif",
	mono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
	hand: "'Bradley Hand', 'Segoe Print', 'Comic Sans MS', 'Comic Neue', cursive"
};
export const YOURS_PAPERS: Record<YoursConfig['paper'], { bg: string; line: string; muted: string }> = {
	cream: { bg: '#faf6ec', line: '#e3dcc9', muted: '#8a8171' },
	white: { bg: '#ffffff', line: '#e5e5e2', muted: '#8f8f8a' },
	dusk: { bg: '#23242a', line: '#3a3b42', muted: '#8d8f98' },
	night: { bg: '#0f0f11', line: '#2a2a2e', muted: '#77787f' }
};
export const YOURS_INKS: Record<YoursConfig['ink'], string> = {
	ink: '#2f2b25',
	blue: '#2b4a9e',
	sepia: '#6b4a2f',
	chalk: '#e8e4da'
};

const KEY = 'onesown:prefs:v1';
const DEFAULT_YOURS: YoursConfig = { font: 'serif', ink: 'ink', paper: 'cream', width: 'narrow', size: 'm' };

let theme = $state<Theme>('system');
let typewriter = $state(false);
let goal = $state<number | null>(null);
let padPaper = $state<PadPaper>('yellow');
let termPhosphor = $state<TermPhosphor>('green');
let postLimit = $state<PostLimit>(280);
let yours = $state<YoursConfig>({ ...DEFAULT_YOURS });
let focus = $state(false);

let loaded = false;

function persist() {
	if (!browser || !loaded) return;
	try {
		localStorage.setItem(
			KEY,
			JSON.stringify({ v: 1, theme, typewriter, goal, padPaper, termPhosphor, postLimit, yours })
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
			typewriter = d.typewriter === true;
			goal = typeof d.goal === 'number' && d.goal > 0 ? Math.floor(d.goal) : null;
			padPaper = oneOf(d.padPaper, ['yellow', 'white'] as const) ?? 'yellow';
			termPhosphor = oneOf(d.termPhosphor, ['green', 'amber'] as const) ?? 'green';
			postLimit = oneOf(d.postLimit, [280, 500] as const) ?? 280;
			const y = (d.yours ?? {}) as Record<string, unknown>;
			yours = {
				font: oneOf(y.font, ['serif', 'sans', 'mono', 'hand'] as const) ?? DEFAULT_YOURS.font,
				ink: oneOf(y.ink, ['ink', 'blue', 'sepia', 'chalk'] as const) ?? DEFAULT_YOURS.ink,
				paper: oneOf(y.paper, ['cream', 'white', 'dusk', 'night'] as const) ?? DEFAULT_YOURS.paper,
				width: oneOf(y.width, ['narrow', 'wide'] as const) ?? DEFAULT_YOURS.width,
				size: oneOf(y.size, ['s', 'm', 'l'] as const) ?? DEFAULT_YOURS.size
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
	get typewriter() {
		return typewriter;
	},
	set typewriter(v: boolean) {
		typewriter = v;
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
		return yours;
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

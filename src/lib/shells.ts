import type { ShellId } from './state.svelte';

export interface ShellMeta {
	id: ShellId;
	name: string;
	hint: string;
}

/** Switcher order: roughly by implied audience, from nobody to everybody. */
export const shellList: ShellMeta[] = [
	{ id: 'bare', name: 'Bare', hint: 'A quiet page — the journaling voice' },
	{ id: 'scratch', name: 'Scratch', hint: 'untitled.txt — words that don’t count' },
	{ id: 'pad', name: 'Pad', hint: 'A legal pad — thinking on paper' },
	{ id: 'term', name: 'Term', hint: 'A terminal buffer — no decoration, no lies' },
	{ id: 'mail', name: 'Mail', hint: 'An unsent email — say it straight' },
	{ id: 'doc', name: 'Doc', hint: 'An office document — writing for the record' },
	{ id: 'post', name: 'Post', hint: 'A tiny box — compression is clarity' },
	{ id: 'yours', name: 'Yours', hint: 'Your room — you set the lighting' }
];

<script lang="ts">
	import { doc } from './state.svelte';
	import { markersToHtml, domToMarkers } from './markers';

	let { label = 'Draft' }: { label?: string } = $props();

	let el = $state<HTMLDivElement | null>(null);
	let active = $state({ bold: false, italic: false, underline: false });
	// The last canonical text this editor produced or rendered — used to tell
	// our own input events apart from external changes (Clear, other rooms).
	let lastSerialized: string | null = null;

	function serialize() {
		if (!el) return;
		const md = domToMarkers(el);
		lastSerialized = md;
		doc.text = md;
		// Plain rooms restore the shared selection on mount; after rich edits the
		// old range is meaningless, so collapse it to the end of the draft.
		doc.setSelection(md.length, md.length);
	}

	function refreshActive() {
		if (!el) return;
		const sel = document.getSelection();
		if (!sel || !sel.anchorNode || !el.contains(sel.anchorNode)) return;
		active.bold = document.queryCommandState('bold');
		active.italic = document.queryCommandState('italic');
		active.underline = document.queryCommandState('underline');
	}

	export function exec(cmd: 'bold' | 'italic' | 'underline') {
		if (!el) return;
		el.focus();
		document.execCommand(cmd);
		serialize();
		refreshActive();
	}

	export function isActive(cmd: 'bold' | 'italic' | 'underline'): boolean {
		return active[cmd];
	}

	function onPaste(e: ClipboardEvent) {
		// Keep the canonical draft honest: paste as plain text only.
		e.preventDefault();
		const text = e.clipboardData?.getData('text/plain') ?? '';
		document.execCommand('insertText', false, text);
		serialize();
	}

	$effect(() => {
		// Firefox honors 'br' paragraphs; Chromium silently ignores this and
		// produces <div> blocks — domToMarkers handles both shapes.
		document.execCommand('defaultParagraphSeparator', false, 'br');
		document.execCommand('styleWithCSS', false, 'false');
		const onSelectionChange = () => refreshActive();
		document.addEventListener('selectionchange', onSelectionChange);
		return () => document.removeEventListener('selectionchange', onSelectionChange);
	});

	// Render canonical → DOM on mount and on external changes (Clear, edits
	// made in other rooms). Our own keystrokes short-circuit via lastSerialized.
	$effect(() => {
		const t = doc.text;
		if (el && t !== lastSerialized) {
			el.innerHTML = markersToHtml(t);
			lastSerialized = t;
		}
	});

	$effect(() => {
		if (el && doc.wantsFocus) {
			el.focus({ preventScroll: true });
			const sel = document.getSelection();
			if (sel) {
				sel.selectAllChildren(el);
				sel.collapseToEnd();
			}
			doc.wantsFocus = false;
		}
	});
</script>

<div
	bind:this={el}
	class="rich"
	contenteditable="true"
	role="textbox"
	tabindex="0"
	aria-multiline="true"
	aria-label={label}
	spellcheck={false}
	oninput={serialize}
	onkeyup={refreshActive}
	onpaste={onPaste}
	ondrop={(e) => e.preventDefault()}
></div>

<style>
	.rich {
		min-height: var(--editor-min, 40vh);
		/* Fill the room's editor slot when the room lays one out as a flex column. */
		flex: 1;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		caret-color: var(--editor-caret, currentColor);
	}
	.rich:focus,
	.rich:focus-visible {
		outline: none;
		box-shadow: none;
	}
	.rich :global(*)::selection,
	.rich::selection {
		background: var(--editor-selection, rgba(125, 125, 125, 0.3));
		color: var(--editor-selection-fg, inherit);
	}
	/* iOS Safari zooms the page when focusing fields under 16px. */
	@media (pointer: coarse) {
		.rich {
			font-size: max(16px, 1em);
		}
	}
</style>

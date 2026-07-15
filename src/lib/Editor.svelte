<script lang="ts">
	import { doc } from './state.svelte';
	import { prefs } from './prefs.svelte';
	import { caretViewportTop } from './caret';

	let {
		placeholder = '',
		spell = false,
		label = 'Draft',
		nowrap = false
	}: { placeholder?: string; spell?: boolean; label?: string; nowrap?: boolean } = $props();

	let el = $state<HTMLTextAreaElement | null>(null);

	// Restore focus + cursor when the user switches shells (the textarea remounts).
	$effect(() => {
		if (el && doc.wantsFocus) {
			const end = Math.min(doc.selEnd, doc.text.length);
			const start = Math.min(doc.selStart, end);
			el.focus({ preventScroll: true });
			el.setSelectionRange(start, end);
			doc.wantsFocus = false;
		}
	});

	function trackSelection() {
		if (el) doc.setSelection(el.selectionStart ?? 0, el.selectionEnd ?? 0);
		maybeCenter();
	}

	// Typewriter scrolling: keep the caret's line near the vertical center.
	function maybeCenter() {
		if (!prefs.typewriter || !el || document.activeElement !== el) return;
		requestAnimationFrame(() => {
			if (!el || document.activeElement !== el) return;
			const delta = caretViewportTop(el) - window.innerHeight * 0.45;
			if (Math.abs(delta) > 24) window.scrollBy({ top: delta, behavior: 'auto' });
		});
	}
</script>

<div class="grow-wrap" class:nowrap data-value={doc.text + '\n'}>
	<textarea
		bind:this={el}
		bind:value={doc.text}
		{placeholder}
		spellcheck={spell}
		autocapitalize={spell ? 'sentences' : 'off'}
		aria-label={label}
		oninput={trackSelection}
		onclick={trackSelection}
		onkeyup={trackSelection}
		onselect={trackSelection}
	></textarea>
</div>

<style>
	/* Auto-grow: a hidden mirror of the value sizes the grid cell; the textarea
	   stretches to match, so the page scrolls instead of the textarea. */
	.grow-wrap {
		display: grid;
		/* Fill the room's editor slot when the room lays one out as a flex
		   column; ignored in rooms that size the editor by content (Post). */
		flex: 1;
	}
	.grow-wrap::after {
		content: attr(data-value) ' ';
		visibility: hidden;
		pointer-events: none;
	}
	.grow-wrap::after,
	.grow-wrap textarea {
		grid-area: 1 / 1;
		width: 100%;
		min-height: var(--editor-min, 40vh);
		margin: 0;
		padding: 0;
		border: none;
		background: transparent;
		font: inherit;
		letter-spacing: inherit;
		color: inherit;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		overflow: hidden;
	}
	.grow-wrap textarea {
		resize: none;
		caret-color: var(--editor-caret, currentColor);
	}
	.grow-wrap.nowrap {
		overflow-x: auto;
	}
	.grow-wrap.nowrap::after,
	.grow-wrap.nowrap textarea {
		white-space: pre;
		overflow-wrap: normal;
	}
	.grow-wrap textarea:focus,
	.grow-wrap textarea:focus-visible {
		outline: none;
		box-shadow: none;
	}
	.grow-wrap textarea::placeholder {
		color: var(--editor-placeholder, color-mix(in srgb, currentColor 35%, transparent));
		opacity: 1;
	}
	.grow-wrap textarea::selection {
		background: var(--editor-selection, rgba(125, 125, 125, 0.3));
		color: var(--editor-selection-fg, inherit);
	}
	/* iOS Safari zooms the page when focusing fields under 16px. */
	@media (pointer: coarse) {
		.grow-wrap::after,
		.grow-wrap textarea {
			font-size: max(16px, 1em);
		}
	}
</style>

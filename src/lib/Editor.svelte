<script lang="ts">
	import { tick } from 'svelte';
	import { doc } from './state.svelte';

	let {
		placeholder = '',
		autocap = false,
		label = 'Draft',
		nowrap = false,
		markers = false
	}: {
		placeholder?: string;
		/**
		 * Capitalise the first letter of each sentence on a soft keyboard. A local
		 * keyboard hint with no privacy dimension — this is NOT spellcheck, which
		 * is off everywhere and not a knob (see the textarea). Prose rooms want it;
		 * a terminal or a scratch file does not.
		 */
		autocap?: boolean;
		label?: string;
		nowrap?: boolean;
		/** Let ⌘B/⌘I type the draft's markers. Off where asterisks are the idiom. */
		markers?: boolean;
	} = $props();

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
	}

	/**
	 * Toggle markers around the selection.
	 *
	 * Whitespace is pushed outside the delimiters first: the codec only reads
	 * `*` as a marker when it hugs non-whitespace, so `**bold **` would sit in
	 * the draft as literal asterisks.
	 *
	 * A run of asterisks encodes both marks at once (`***` is bold + italic), so
	 * each mark is read out of the run rather than matched whole: bold is
	 * present when the run is 2 or more, italic when it's odd. That way ⌘I on
	 * `**bold**` nests to `***bold***`, and ⌘I again peels only the italic back
	 * off — without either one dismantling the other.
	 */
	async function toggleMarker(marker: string) {
		if (!el) return;
		const value = doc.text;
		let start = el.selectionStart ?? 0;
		let end = el.selectionEnd ?? 0;
		while (start < end && /\s/.test(value[start])) start++;
		while (end > start && /\s/.test(value[end - 1])) end--;

		const before = value.slice(0, start);
		const sel = value.slice(start, end);
		const after = value.slice(end);
		const m = marker.length;
		const has = (lead: number, trail: number) =>
			m === 2 ? lead >= 2 && trail >= 2 : lead % 2 === 1 && trail % 2 === 1;
		const runBefore = (before.match(/\*+$/)?.[0] ?? '').length;
		const runAfter = (after.match(/^\*+/)?.[0] ?? '').length;
		const selLead = (sel.match(/^\*+/)?.[0] ?? '').length;
		const selTrail = (sel.match(/\*+$/)?.[0] ?? '').length;

		let next: string;
		let ns: number;
		let ne: number;
		if (has(runBefore, runAfter)) {
			next = before.slice(0, -m) + sel + after.slice(m);
			ns = start - m;
			ne = end - m;
		} else if (has(selLead, selTrail) && sel.length > 2 * m) {
			next = before + sel.slice(m, -m) + after;
			ns = start;
			ne = end - 2 * m;
		} else if (sel === '') {
			// Nothing selected: leave the delimiters and park the caret inside.
			next = before + marker + marker + after;
			ns = ne = start + m;
		} else {
			next = before + marker + sel + marker + after;
			ns = start + m;
			ne = end + m;
		}

		doc.text = next;
		await tick();
		el?.focus();
		el?.setSelectionRange(ns, ne);
		doc.setSelection(ns, ne);
	}

	function onKeydown(e: KeyboardEvent) {
		if (!markers) return;
		const mod = e.metaKey || e.ctrlKey;
		if (!mod || e.altKey || e.shiftKey) return;
		const marker = e.key.toLowerCase() === 'b' ? '**' : e.key.toLowerCase() === 'i' ? '*' : null;
		if (!marker) return;
		e.preventDefault();
		void toggleMarker(marker);
	}
</script>

<!-- spellcheck is off, deliberately and not by a prop. The page promises nothing
     you write leaves it, and enforces that with a CSP the browser obeys — but a
     browser's spellchecker runs outside the page's network context, where the
     CSP cannot see it, and Chrome's and Edge's cloud modes send what you type to
     their servers. That is the writer's own browser setting, which the page can
     neither cause nor prevent, but it can decline to invite it. -->
<div class="grow-wrap" class:nowrap data-value={doc.text + '\n'}>
	<textarea
		bind:this={el}
		bind:value={doc.text}
		{placeholder}
		spellcheck={false}
		autocapitalize={autocap ? 'sentences' : 'off'}
		dir="auto"
		readonly={!doc.ready}
		aria-label={label}
		oninput={trackSelection}
		onclick={trackSelection}
		onkeydown={onKeydown}
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
	/*
	 * The mirror above costs a second full layout of the draft on every
	 * keystroke — ~110ms at 500kb, and it scales with length. Where the browser
	 * can size the field itself, drop the clone entirely (~3x faster typing).
	 *
	 * Not for nowrap: there the mirror also establishes the *width* the wrapper
	 * scrolls, which field-sizing wouldn't replace.
	 */
	@supports (field-sizing: content) {
		.grow-wrap:not(.nowrap)::after {
			content: none;
		}
		.grow-wrap:not(.nowrap) textarea {
			field-sizing: content;
		}
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

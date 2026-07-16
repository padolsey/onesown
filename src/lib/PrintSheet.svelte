<script lang="ts">
	/**
	 * Paper is not a room.
	 *
	 * Eight rooms print as one sheet. The rooms are lenses on a single canonical
	 * string, and each one is opinionated because the room shapes the writer —
	 * while the writing is happening. Paper is where that stops. Term's phosphor
	 * on paper is 1.44:1 green on white, or a black sheet; Doc's ribbon is a
	 * picture of a word processor drawn around words that were never in one. The
	 * furniture is a prop for the writer's head, and it does not travel.
	 *
	 * Never print the live editor. Editor.svelte grows the textarea to fit its
	 * content, so there is no scrollport to clip — and Chromium slices the
	 * control across page breaks and DROPS whatever lands on the cut. Measured:
	 * 6 of 8 rooms lost words, Doc printing 1 line of 40, and Bare — the simplest
	 * room there is — swallowing lines 76 and 227 of 400 between intact
	 * neighbours. Silent, partial, and dependent on where a break happens to
	 * fall, which is not a rule anyone could learn. This sheet is ordinary
	 * flowed text built from the string itself, and it paginates the way prose
	 * does.
	 */
	import { flushSync } from 'svelte';
	import { doc } from './state.svelte';
	import { markersToHtml } from './markers';

	let sheet = $state<string | null>(null);
	let restoreTitle: string | null = null;

	// Built on demand and never eagerly. A hidden duplicate of the draft rebuilt
	// on every keystroke would cost several milliseconds of layout forever, for a
	// thing used once in a blue moon — this app has measured that mistake before.
	// Until a print begins, none of this exists.
	function build() {
		sheet = markersToHtml(doc.text);
		// The printout is the writer's, not the app's: this is what the browser
		// stamps in its header and what Save-as-PDF offers as the filename.
		if (restoreTitle === null) restoreTitle = document.title;
		document.title = doc.title;
		// A real window.print() is synchronous and will not wait for Svelte's
		// microtask flush. The tests pass without this, because page.pdf() drains
		// microtasks before it lays out — so this is held by argument, not by
		// them. Do not remove it because they stay green.
		flushSync();
	}

	function teardown() {
		sheet = null;
		if (restoreTitle !== null) {
			document.title = restoreTitle;
			restoreTitle = null;
		}
	}

	// Two triggers, because neither covers everything: beforeprint is what ⌘P and
	// the browser's own menu fire; the print media query is what print previews
	// and emulateMedia change. Both are idempotent.
	$effect(() => {
		const mql = window.matchMedia('print');
		const onChange = (e: MediaQueryListEvent) => (e.matches ? build() : teardown());
		mql.addEventListener('change', onChange);
		window.addEventListener('beforeprint', build);
		window.addEventListener('afterprint', teardown);
		return () => {
			mql.removeEventListener('change', onChange);
			window.removeEventListener('beforeprint', build);
			window.removeEventListener('afterprint', teardown);
		};
	});
</script>

{#if sheet !== null}
	<!-- {@html} on the writer's own text, deliberately. markersToHtml escapes
	     & < > and emits only <b>, <i>, <u> and <br>; RichEditor already trusts it
	     exactly this way, through innerHTML, on every keystroke in Doc and Mail.
	     This rests on no trust the app doesn't already rest on. It must never be
	     handed HTML from anywhere else. -->
	<article class="print-sheet" aria-hidden="true">{@html sheet}</article>
{/if}

<style>
	.print-sheet {
		display: none;
	}
	@media print {
		.print-sheet {
			display: block;
			/* A reading face, and the same one whichever door you wrote behind. */
			font-family: 'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia,
				'Times New Roman', serif;
			font-size: 11pt;
			line-height: 1.5;
			max-width: 34em;
			margin: 0 auto;
			color: #000;
			background: #fff;
			white-space: pre-wrap;
			overflow-wrap: break-word;
			orphans: 2;
			widows: 2;
		}
	}
</style>

<script lang="ts">
	import Editor from '../Editor.svelte';
	import { doc } from '../state.svelte';
	import { prefs } from '../prefs.svelte';

	// Limit variant (Preferences → This room): 280 or 500 characters.
	const LIMIT = $derived(prefs.postLimit);

	let copied = $state(false);
	const remaining = $derived(LIMIT - doc.chars);

	async function post() {
		try {
			await navigator.clipboard.writeText(doc.text);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// clipboard unavailable — the button is a prop anyway
		}
	}
</script>

<section
	class="mx-auto w-full max-w-xl rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
	style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;"
>
	<div class="flex gap-3">
		<div
			class="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-violet-400 via-fuchsia-400 to-amber-300"
			aria-hidden="true"
		></div>
		<div
			class="flex-1 pt-1.5 text-[18px] leading-[1.45] text-[#0f1419]"
			style="--editor-caret: #1d9bf0; --editor-selection: rgba(29, 155, 240, 0.22); --editor-min: 7rem;"
		>
			<Editor spell={true} placeholder="What’s the word?" label="Draft — short post" />
		</div>
	</div>
	<div class="mt-3 flex items-center border-t border-stone-100 pt-3">
		<span class="flex select-none gap-3 text-sky-500/80" aria-hidden="true">
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<rect x="3" y="3" width="18" height="18" rx="3" />
				<circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none" />
				<path d="M21 15l-5-5L5 21" />
			</svg>
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M6 20V10M12 20V4M18 20v-8" />
			</svg>
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="12" cy="12" r="9" />
				<path d="M8 14s1.5 2 4 2 4-2 4-2" />
				<circle cx="9" cy="10" r="0.5" fill="currentColor" />
				<circle cx="15" cy="10" r="0.5" fill="currentColor" />
			</svg>
		</span>
		<span
			class="ml-auto mr-3 text-[13px] tabular-nums {remaining < 0
				? 'font-semibold text-red-600'
				: remaining <= 20
					? 'text-amber-600'
					: 'text-stone-500'}"
		>
			{remaining}
		</span>
		<span class="sr-only" aria-live="polite">
			{remaining < 0 ? `${-remaining} characters over the ${LIMIT} limit` : ''}
		</span>
		<button
			type="button"
			onclick={post}
			disabled={doc.chars === 0 || remaining < 0}
			class="post-btn rounded-full bg-sky-500 px-4 py-1.5 text-[14px] font-bold text-white transition-colors hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-40"
		>
			{copied ? 'Copied ✓' : 'Post'}
		</button>
	</div>
	{#if remaining < 0}
		<p class="mt-2 text-right text-[12px] text-red-600">{-remaining} over — the room is winning.</p>
	{/if}
</section>

<style>
	/* White text on a blue pill, sitting on a white card: the global currentColor
	   ring would be white on white. sky-600 (the button's own hover colour) rather
	   than its sky-500 fill — 500 doesn't clear 3:1 against the card. */
	.post-btn:focus-visible {
		outline-color: var(--color-sky-600);
		outline-offset: 3px;
	}
</style>

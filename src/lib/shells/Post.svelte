<script lang="ts">
	import Editor from '../Editor.svelte';
	import { doc } from '../state.svelte';
	import { prefs } from '../prefs.svelte';

	// Limit variant (Preferences → This room): 280 or 500 characters.
	const LIMIT = $derived(prefs.postLimit);
	const remaining = $derived(LIMIT - doc.chars);
</script>

<!--
	The counter and the warning are real; the rest is scenery, kept wordless. The
	button used to say "Post" and copy to the clipboard — an action word on a thing
	that did something else, which is the one combination guaranteed to confuse.
	It's a coloured pill now: unmistakable from the corner of the eye, honest under
	a direct look.
-->
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
					? 'text-amber-700'
					: 'text-stone-500'}"
		>
			{remaining}
		</span>
		<span class="sr-only" aria-live="polite">
			{remaining < 0 ? `Over the ${LIMIT} character limit` : ''}
		</span>
		<span class="post-btn" aria-hidden="true"></span>
	</div>
	{#if remaining < 0}
		<p class="mt-2 text-right text-[12px] text-red-600">{-remaining} over — the room is winning.</p>
	{/if}
</section>

<style>
	/* Where Post was. The pill is the shape the eye expects in that corner. */
	.post-btn {
		display: block;
		width: 3.75rem;
		height: 1.9rem;
		border-radius: 9999px;
		background: var(--color-sky-500);
	}
</style>

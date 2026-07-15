<script lang="ts">
	import Editor from '../Editor.svelte';
	import { prefs, YOURS_FONTS, YOURS_INKS, YOURS_PAPERS, type YoursConfig } from '../prefs.svelte';

	// The eighth room: the one place the lighting is yours to set. All choices
	// persist in preferences; every other room stays deliberately opinionated.
	const y = $derived(prefs.yours);
	const paper = $derived(YOURS_PAPERS[y.paper]);
	const ink = $derived(YOURS_INKS[y.ink]);
	const font = $derived(YOURS_FONTS[y.font]);
	const width = $derived(y.width === 'wide' ? '46rem' : '34rem');
	const size = $derived(y.size === 's' ? '15px' : y.size === 'l' ? '20px' : '17px');

	function set<K extends keyof YoursConfig>(key: K, value: YoursConfig[K]) {
		prefs.yours = { ...prefs.yours, [key]: value };
	}

	const options = [
		{ key: 'paper', label: 'Paper', values: ['cream', 'white', 'dusk', 'night'] },
		{ key: 'ink', label: 'Ink', values: ['ink', 'blue', 'sepia', 'chalk'] },
		{ key: 'font', label: 'Font', values: ['serif', 'sans', 'mono', 'hand'] },
		{ key: 'width', label: 'Width', values: ['narrow', 'wide'] },
		{ key: 'size', label: 'Size', values: ['s', 'm', 'l'] }
	] as const;
</script>

<section
	class="flex flex-1 flex-col rounded-2xl border shadow-sm"
	style="background: {paper.bg}; border-color: {paper.line};"
>
	<div
		class="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1.5 border-b px-4 py-2 text-[11px]"
		style="border-color: {paper.line}; color: {paper.muted};"
	>
		{#each options as opt (opt.key)}
			<label class="flex items-center gap-1.5">
				{opt.label}
				<select
					class="yours-select"
					style="border-color: {paper.line}; color: inherit;"
					value={y[opt.key]}
					onchange={(e) => set(opt.key, e.currentTarget.value as never)}
				>
					{#each opt.values as v (v)}
						<option value={v}>{v}</option>
					{/each}
				</select>
			</label>
		{/each}
	</div>
	<div
		class="mx-auto flex w-full flex-1 flex-col px-6 py-10 leading-[1.75] sm:px-8"
		style="max-width: {width}; font-family: {font}; font-size: {size}; color: {ink}; --editor-caret: {ink}; --editor-selection: color-mix(in srgb, {ink} 22%, transparent); --editor-min: 16rem;"
	>
		<Editor spell={true} placeholder="Your room. Your rules." label="Draft — your room" />
	</div>
</section>

<style>
	.yours-select {
		border-width: 1px;
		border-radius: 0.3rem;
		background: transparent;
		padding: 0.1rem 0.3rem;
		font-size: 11px;
	}
</style>

<script lang="ts">
	import Editor from '../Editor.svelte';
	import { doc } from '../state.svelte';
	import { prefs } from '../prefs.svelte';

	const mono = "ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";

	// Phosphor variant (Preferences → This room): green or amber CRT.
	const P = $derived(
		prefs.termPhosphor === 'amber'
			? {
					text: '#e6c07b',
					caret: '#ffbf47',
					selection: 'rgba(255, 191, 71, 0.28)',
					prompt: '#8a6f3d',
					promptAccent: '#c9a35c',
					footer: '#c09a55'
				}
			: {
					text: '#b6e3ae',
					caret: '#4ade80',
					selection: 'rgba(74, 222, 128, 0.28)',
					prompt: '#4f7a4a',
					promptAccent: '#8eb886',
					footer: '#79a973'
				}
	);
</script>

<section class="mx-auto max-w-4xl overflow-clip rounded-xl bg-[#0b0e0c] shadow-2xl shadow-black/40 ring-1 ring-black/60">
	<header class="relative flex items-center bg-[#181c19] px-4 py-2.5">
		<span class="flex gap-2" aria-hidden="true">
			<span class="h-3 w-3 rounded-full bg-[#f25d51]"></span>
			<span class="h-3 w-3 rounded-full bg-[#fbbe3c]"></span>
			<span class="h-3 w-3 rounded-full bg-[#58c342]"></span>
		</span>
		<span
			class="pointer-events-none absolute inset-x-0 select-none text-center text-[12px] text-stone-400"
			style="font-family: {mono};"
		>
			draft.txt — 80×24
		</span>
	</header>
	<div
		class="px-4 py-5 text-[14px] leading-[1.7] sm:px-6"
		style="font-family: {mono}; color: {P.text}; --editor-caret: {P.caret}; --editor-selection: {P.selection}; --editor-min: max(16rem, calc(100dvh - var(--chrome, 7rem) - 12rem));"
	>
		<p class="mb-3 select-none" style="color: {P.prompt};" aria-hidden="true">
			~/drafts <span style="color: {P.promptAccent};">$</span> vi draft.txt
		</p>
		<div class="max-w-[80ch]">
			<Editor label="Draft — terminal buffer" />
		</div>
	</div>
	<footer
		class="sticky bottom-0 flex select-none justify-between bg-[#181c19] px-4 py-1.5 text-[12px]"
		style="font-family: {mono}; color: {P.footer};"
	>
		<span aria-hidden="true">-- INSERT --</span>
		<span>{doc.words}{prefs.goal ? '/' + prefs.goal : ''}w · {doc.chars}c</span>
	</footer>
</section>

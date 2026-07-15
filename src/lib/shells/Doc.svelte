<script lang="ts">
	import RichEditor from '../RichEditor.svelte';
	import { doc } from '../state.svelte';

	let editor = $state<RichEditor | null>(null);

	const commands = [
		{ cmd: 'bold', glyph: 'B', extra: 'font-bold', title: 'Bold (Ctrl+B)' },
		{ cmd: 'italic', glyph: 'I', extra: 'italic doc-serif', title: 'Italic (Ctrl+I)' },
		{ cmd: 'underline', glyph: 'U', extra: 'underline', title: 'Underline (Ctrl+U)' }
	] as const;
</script>

<section
	class="overflow-clip rounded-xl border border-stone-300/70 bg-[#e9e7e4] shadow-xl shadow-stone-900/10"
	style="font-family: Calibri, Carlito, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;"
>
	<div class="flex items-center gap-1 border-b border-[#d5d2ce] bg-[#f7f5f2] px-3 py-1.5 text-stone-500">
		<span class="select-none rounded border border-[#d5d2ce] bg-white px-2 py-0.5 text-[12px]" aria-hidden="true">Calibri</span>
		<span class="select-none rounded border border-[#d5d2ce] bg-white px-1.5 py-0.5 text-[12px]" aria-hidden="true">11</span>
		<span class="mx-1 h-4 w-px bg-[#d5d2ce]" aria-hidden="true"></span>
		{#each commands as c (c.cmd)}
			<button
				type="button"
				title={c.title}
				aria-pressed={editor?.isActive(c.cmd) ?? false}
				onmousedown={(e) => e.preventDefault()}
				onclick={() => editor?.exec(c.cmd)}
				class="w-6 rounded py-0.5 text-center text-[13px] transition-colors {c.extra} {editor?.isActive(c.cmd)
					? 'bg-[#dcd8d2] text-stone-800'
					: 'hover:bg-[#eceae6]'}"
			>
				{c.glyph}
			</button>
		{/each}
		<span class="mx-1 h-4 w-px bg-[#d5d2ce]" aria-hidden="true"></span>
		<span class="select-none text-[12px]" aria-hidden="true">A<span class="align-super text-[10px]">a</span></span>
	</div>
	<div class="ruler h-4 border-b border-[#d5d2ce] bg-[#f1efec]" aria-hidden="true"></div>
	<div class="px-3 py-8 sm:px-8">
		<div
			class="mx-auto w-[50rem] max-w-full bg-white px-[clamp(1.5rem,7vw,6rem)] py-[clamp(2rem,7vw,6rem)] shadow-[0_2px_8px_rgba(0,0,0,0.18)]"
		>
			<div
				class="text-[14.5px] leading-[1.45] text-[#1f1f1f]"
				style="--editor-caret: #185abd; --editor-selection: rgba(58, 118, 216, 0.25); --editor-min: 60vh;"
			>
				<RichEditor bind:this={editor} spell={true} label="Draft — office document" />
			</div>
		</div>
	</div>
	<footer
		class="sticky bottom-0 flex select-none justify-between border-t border-[#d5d2ce] bg-[#f7f5f2] px-4 py-1 text-[12px] text-stone-500"
	>
		<span>Page 1 of 1 · {doc.words} words</span>
		<span>English (UK) · 100%</span>
	</footer>
</section>

<style>
	.doc-serif {
		font-family: Georgia, serif;
	}
	.ruler {
		background-image: repeating-linear-gradient(to right, #c9c6c2 0 1px, transparent 1px 9px);
		background-size: 100% 5px;
		background-position: left bottom;
		background-repeat: repeat-x;
	}
</style>

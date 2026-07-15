<script lang="ts">
	import RichEditor from '../RichEditor.svelte';
	import { doc } from '../state.svelte';
	import { prefs } from '../prefs.svelte';

	let editor = $state<RichEditor | null>(null);

	const commands = [
		{ cmd: 'bold', glyph: 'B', extra: 'font-bold', title: 'Bold (Ctrl+B)' },
		{ cmd: 'italic', glyph: 'I', extra: 'italic doc-serif', title: 'Italic (Ctrl+I)' },
		{ cmd: 'underline', glyph: 'U', extra: 'underline', title: 'Underline (Ctrl+U)' }
	] as const;
</script>

<section
	class="flex flex-1 flex-col overflow-clip rounded-xl border border-stone-300/70 bg-[#e9e7e4] shadow-xl shadow-stone-900/10"
	style="font-family: Calibri, Carlito, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;"
>
	<div class="flex shrink-0 items-center gap-1 border-b border-[#d5d2ce] bg-[#f7f5f2] px-3 py-1.5 text-stone-600">
		<span class="doc-chip w-16" aria-hidden="true"></span>
		<span class="doc-chip w-7" aria-hidden="true"></span>
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
		<span class="doc-chip w-5" aria-hidden="true"></span>
	</div>
	<div class="ruler h-4 shrink-0 border-b border-[#d5d2ce] bg-[#f1efec]" aria-hidden="true"></div>
	<div class="flex flex-1 flex-col px-3 pt-8 sm:px-8">
		<div
			class="mx-auto flex w-[50rem] max-w-full flex-1 flex-col bg-white px-[clamp(1.5rem,7vw,6rem)] py-[clamp(2rem,7vw,6rem)] shadow-[0_2px_8px_rgba(0,0,0,0.18)]"
		>
			<div
				class="flex flex-1 flex-col text-[14.5px] leading-[1.45] text-[#1f1f1f]"
				style="--editor-caret: #185abd; --editor-selection: rgba(58, 118, 216, 0.25); --editor-min: 14rem;"
			>
				<RichEditor bind:this={editor} spell={true} label="Draft — office document" />
			</div>
		</div>
	</div>
	<footer
		class="sticky bottom-0 flex shrink-0 items-center justify-between border-t border-[#d5d2ce] bg-[#f7f5f2] px-4 py-1 text-[12px] text-stone-600"
	>
		<span>{doc.words}{prefs.goal ? ` of ${prefs.goal}` : ''} words</span>
		<span class="flex items-center gap-1.5" aria-hidden="true">
			<span class="doc-chip w-8"></span>
			<span class="doc-chip w-4"></span>
		</span>
	</footer>
</section>

<style>
	/* Ribbon and status-bar furniture. A shape where a word was: it reads as a
	   control from the periphery, and asserts nothing under a direct look. */
	.doc-chip {
		display: inline-block;
		height: 0.85rem;
		border-radius: 0.2rem;
		background: #dcd8d2;
	}
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

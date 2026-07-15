<script lang="ts">
	import RichEditor from '../RichEditor.svelte';

	let editor = $state<RichEditor | null>(null);

	const commands = [
		{ cmd: 'bold', glyph: 'B', extra: 'font-bold', title: 'Bold (Ctrl+B)' },
		{ cmd: 'italic', glyph: 'I', extra: 'italic', title: 'Italic (Ctrl+I)' },
		{ cmd: 'underline', glyph: 'U', extra: 'underline', title: 'Underline (Ctrl+U)' }
	] as const;
</script>

<!--
	Everything but the editor and B/I/U is scenery, and scenery is kept wordless on
	purpose. The eye reads a compose window from the periphery — a header, a stack
	of addressing rows, a coloured button bottom-left — and peripheral vision can't
	resolve text anyway, so the words were never carrying the atmosphere. What they
	did carry was a claim: a Send button that didn't send needed a footer explaining
	that it didn't, and the addressing fields took real typing into state no other
	room could see and no saved file ever contained. The shapes stay; the promises go.
	An unsent email, unaddressed, with no Send on it.
-->
<section
	class="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-clip rounded-xl border border-stone-300/70 bg-white shadow-2xl shadow-stone-900/10"
	style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;"
>
	<header class="flex shrink-0 items-center justify-center border-b border-stone-200 bg-gradient-to-b from-stone-100 to-stone-50 px-4 py-2.5">
		<span class="select-none text-[13px] font-medium text-stone-500">New Message</span>
	</header>
	<div aria-hidden="true">
		{#each ['To', 'Subject'] as field (field)}
			<div class="flex shrink-0 items-center border-b border-stone-100 px-4">
				<span class="w-16 select-none py-2 text-[13px] text-stone-500">{field}:</span>
				<span class="mail-slot flex-1"></span>
			</div>
		{/each}
	</div>
	<div
		class="flex flex-1 flex-col px-4 py-4 text-[14px] leading-[1.55] text-[#1f2328]"
		style="--editor-caret: #1a73e8; --editor-selection: rgba(26, 115, 232, 0.22); --editor-min: 14rem;"
	>
		<RichEditor bind:this={editor} spell={true} label="Draft — email body" />
	</div>
	<footer class="flex shrink-0 items-center gap-1 border-t border-stone-100 px-4 py-3">
		<span class="mail-send mr-2" aria-hidden="true"></span>
		{#each commands as c (c.cmd)}
			<button
				type="button"
				title={c.title}
				aria-pressed={editor?.isActive(c.cmd) ?? false}
				onmousedown={(e) => e.preventDefault()}
				onclick={() => editor?.exec(c.cmd)}
				class="w-7 rounded py-1 text-center text-[13px] text-stone-500 transition-colors {c.extra} {editor?.isActive(
					c.cmd
				)
					? 'bg-stone-200 text-stone-800'
					: 'hover:bg-stone-100'}"
			>
				{c.glyph}
			</button>
		{/each}
	</footer>
</section>

<style>
	/* An addressing row with nothing in it. The line is the shape; the height keeps
	   the header's rhythm without a field to fill. */
	.mail-slot {
		display: block;
		height: 1.6rem;
	}
	/* Where Send was. Reads as the compose button from the corner of the eye, and
	   says nothing it can't do. */
	.mail-send {
		display: block;
		width: 4.5rem;
		height: 1.9rem;
		border-radius: 0.375rem;
		background: #1a73e8;
	}
</style>

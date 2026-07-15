<script lang="ts">
	import RichEditor from '../RichEditor.svelte';
	import { doc } from '../state.svelte';

	let editor = $state<RichEditor | null>(null);
	let sent = $state(false);
	let showCcBcc = $state(doc.mailCc !== '' || doc.mailBcc !== '');

	const commands = [
		{ cmd: 'bold', glyph: 'B', extra: 'font-bold', title: 'Bold (Ctrl+B)' },
		{ cmd: 'italic', glyph: 'I', extra: 'italic', title: 'Italic (Ctrl+I)' },
		{ cmd: 'underline', glyph: 'U', extra: 'underline', title: 'Underline (Ctrl+U)' }
	] as const;

	async function send() {
		try {
			await navigator.clipboard.writeText(doc.text);
			sent = true;
			setTimeout(() => (sent = false), 2000);
		} catch {
			// clipboard unavailable — the button is a prop anyway
		}
	}
</script>

<section
	class="mx-auto max-w-3xl overflow-clip rounded-xl border border-stone-300/70 bg-white shadow-2xl shadow-stone-900/10"
	style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;"
>
	<header class="flex items-center justify-center border-b border-stone-200 bg-gradient-to-b from-stone-100 to-stone-50 px-4 py-2.5">
		<span class="select-none text-[13px] font-medium text-stone-500">New Message</span>
	</header>
	<div class="flex items-center border-b border-stone-100 px-4">
		<label class="w-16 select-none py-2 text-[13px] text-stone-400" for="mail-to">To:</label>
		<input
			id="mail-to"
			bind:value={doc.mailTo}
			class="flex-1 bg-transparent py-2 text-[13px] text-stone-800 focus:outline-none"
			autocomplete="off"
			spellcheck="false"
		/>
		<button
			type="button"
			class="select-none text-[12px] text-stone-400 transition-colors hover:text-stone-600"
			aria-expanded={showCcBcc}
			onclick={() => (showCcBcc = !showCcBcc)}
		>
			Cc Bcc
		</button>
	</div>
	{#if showCcBcc}
		<div class="flex items-center border-b border-stone-100 px-4">
			<label class="w-16 select-none py-2 text-[13px] text-stone-400" for="mail-cc">Cc:</label>
			<input
				id="mail-cc"
				bind:value={doc.mailCc}
				class="flex-1 bg-transparent py-2 text-[13px] text-stone-800 focus:outline-none"
				autocomplete="off"
				spellcheck="false"
			/>
		</div>
		<div class="flex items-center border-b border-stone-100 px-4">
			<label class="w-16 select-none py-2 text-[13px] text-stone-400" for="mail-bcc">Bcc:</label>
			<input
				id="mail-bcc"
				bind:value={doc.mailBcc}
				class="flex-1 bg-transparent py-2 text-[13px] text-stone-800 focus:outline-none"
				autocomplete="off"
				spellcheck="false"
			/>
		</div>
	{/if}
	<div class="flex items-center border-b border-stone-100 px-4">
		<label class="w-16 select-none py-2 text-[13px] text-stone-400" for="mail-subject">Subject:</label>
		<input
			id="mail-subject"
			bind:value={doc.mailSubject}
			class="flex-1 bg-transparent py-2 text-[13px] font-medium text-stone-800 focus:outline-none"
			autocomplete="off"
		/>
	</div>
	<div
		class="px-4 py-4 text-[14px] leading-[1.55] text-[#1f2328]"
		style="--editor-caret: #1a73e8; --editor-selection: rgba(26, 115, 232, 0.22); --editor-min: 45vh;"
	>
		<RichEditor bind:this={editor} spell={true} label="Draft — email body" />
	</div>
	<footer class="flex items-center gap-1 border-t border-stone-100 px-4 py-3">
		<button
			type="button"
			onclick={send}
			class="mr-2 rounded-md bg-[#1a73e8] px-5 py-1.5 text-[13.5px] font-medium text-white transition-colors hover:bg-[#1765cc]"
		>
			{sent ? 'Copied ✓' : 'Send'}
		</button>
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
		<span class="ml-auto select-none text-[12px] text-stone-500">Nothing is sent — Send copies your words.</span>
	</footer>
</section>

<style>
	/* iOS Safari zooms the page when focusing fields under 16px. */
	@media (pointer: coarse) {
		input {
			font-size: 16px;
		}
	}
</style>

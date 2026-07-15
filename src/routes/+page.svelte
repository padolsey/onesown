<script lang="ts">
	import type { Component } from 'svelte';
	import { doc, type ShellId } from '$lib/state.svelte';
	import { shellList } from '$lib/shells';
	import Bare from '$lib/shells/Bare.svelte';
	import Scratch from '$lib/shells/Scratch.svelte';
	import Pad from '$lib/shells/Pad.svelte';
	import Term from '$lib/shells/Term.svelte';
	import Mail from '$lib/shells/Mail.svelte';
	import Doc from '$lib/shells/Doc.svelte';
	import Post from '$lib/shells/Post.svelte';

	const shellViews: Record<ShellId, Component> = {
		bare: Bare,
		scratch: Scratch,
		pad: Pad,
		term: Term,
		mail: Mail,
		doc: Doc,
		post: Post
	};
	const ShellView = $derived(shellViews[doc.shell]);

	let isMac = $state(false);

	$effect(() => {
		doc.load();
		isMac = /Mac|iP(hone|ad|od)/.test(navigator.platform);
		return () => doc.flush();
	});

	const statusText = $derived(
		doc.diskNote ??
			(doc.saveState === 'pending'
				? 'Saving…'
				: doc.saveState === 'saved'
					? 'Saved in this browser'
					: doc.saveState === 'error'
						? 'Couldn’t autosave'
						: 'Autosaves as you type')
	);

	function onKeydown(e: KeyboardEvent) {
		if (
			(e.metaKey || e.ctrlKey) &&
			!e.shiftKey &&
			!e.altKey &&
			(e.key.toLowerCase() === 's' || e.code === 'KeyS')
		) {
			e.preventDefault();
			if (e.repeat) return;
			void doc.saveToDisk();
		}
	}

	function onVisibilityChange() {
		if (document.visibilityState === 'hidden') doc.flush();
	}

	function clear() {
		doc.requestClear();
	}
</script>

<svelte:head>
	<title>A Room of One’s Own — change the room your writing lives in</title>
	<meta
		name="description"
		content="A notepad with interchangeable rooms — write the same draft inside a quiet page, a scratch file, a legal pad, a terminal, an unsent email, an office doc, or a 280-character box, and notice what each room does to your voice."
	/>
	<meta property="og:type" content="website" />
	<meta property="og:title" content="A Room of One’s Own" />
	<meta property="og:description" content="One draft, seven rooms. A notepad that swaps the app around your words." />
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content="A Room of One’s Own" />
	<meta name="twitter:description" content="One draft, seven rooms. A notepad that swaps the app around your words." />
</svelte:head>

<svelte:window onkeydown={onKeydown} onbeforeunload={() => doc.flush()} />
<svelte:document onvisibilitychange={onVisibilityChange} />

<div class="room-app min-h-screen">
	<div class="mx-auto max-w-5xl px-4 pb-20 pt-10 sm:px-6 lg:px-8">
		<header class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
			<h1 class="room-wordmark">A Room of One’s Own</h1>
			<p class="room-tagline">change the room your writing lives in</p>
		</header>
		<p class="room-intro mt-3 max-w-2xl">
			One draft, seven rooms. What you write is shaped by what you write <em>into</em> — swap the
			room around your words and notice what it does to your voice. Every room keeps its own
			lighting.
		</p>

		<div class="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3">
			<div class="flex max-w-full gap-1.5 overflow-x-auto">
				{#each shellList as s (s.id)}
					<button
						type="button"
						title={s.hint}
						aria-pressed={doc.shell === s.id}
						onclick={() => doc.switchShell(s.id)}
						class="room-tab"
					>
						{s.name}
					</button>
				{/each}
			</div>
			<div class="ml-auto flex items-center gap-3">
				<span class="room-status">{statusText}</span>
				<span class="sr-only" aria-live="polite">
					{doc.diskNote ?? (doc.saveState === 'error' ? 'Couldn’t autosave' : '')}
				</span>
				<button type="button" onclick={() => void doc.saveToDisk()} class="room-btn">
					Save to disk
					<kbd>{isMac ? '⌘S' : 'Ctrl+S'}</kbd>
				</button>
				<button type="button" onclick={clear} class="room-clear">Clear</button>
			</div>
		</div>

		<div class="mt-4">
			<ShellView />
		</div>

		<p class="room-note mt-6">
			Nothing you write leaves this page. The draft autosaves to this browser’s local storage, and
			Save to disk writes a plain .txt file — in browsers without the File System Access API it
			downloads one instead. Formatting lives in the draft as plain markers (**bold**, *italics*) —
			rooms that can render it do, and rooms that can’t show the markers. Same words, different
			room: the register shift is the experiment.
		</p>
	</div>
</div>

<style>
	.room-app {
		--bg: #f2efe9;
		--fg: #2f2b25;
		--muted: #6c6456;
		--line: #d9d3c7;
		background: var(--bg);
		color: var(--fg);
		font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
	}
	@media (prefers-color-scheme: dark) {
		.room-app {
			--bg: #191817;
			--fg: #e6e1d7;
			--muted: #98917f;
			--line: #383530;
		}
	}
	.room-wordmark {
		font-family: Georgia, 'Times New Roman', serif;
		font-style: italic;
		font-size: 1.9rem;
		font-weight: 700;
		letter-spacing: -0.01em;
	}
	.room-tagline {
		color: var(--muted);
		font-size: 0.95rem;
	}
	.room-intro {
		color: var(--muted);
		font-size: 0.875rem;
		line-height: 1.6;
	}
	.room-tab {
		flex-shrink: 0;
		border: 1px solid var(--line);
		border-radius: 9999px;
		padding: 0.35rem 0.8rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--muted);
		transition:
			color 120ms,
			border-color 120ms,
			background 120ms;
	}
	.room-tab:hover {
		border-color: var(--muted);
		color: var(--fg);
	}
	.room-tab[aria-pressed='true'] {
		background: var(--fg);
		border-color: var(--fg);
		color: var(--bg);
	}
	.room-status {
		color: var(--muted);
		font-size: 0.75rem;
	}
	.room-btn {
		display: inline-flex;
		align-items: center;
		border: 1px solid var(--line);
		border-radius: 0.4rem;
		padding: 0.35rem 0.7rem;
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--fg);
		transition: border-color 120ms;
	}
	.room-btn:hover {
		border-color: var(--muted);
	}
	.room-btn kbd {
		margin-left: 0.4rem;
		border: 1px solid var(--line);
		border-radius: 0.25rem;
		padding: 0 0.25rem;
		font-size: 0.625rem;
		color: var(--muted);
	}
	.room-clear {
		padding: 0.35rem 0.5rem;
		font-size: 0.75rem;
		color: var(--muted);
		transition: color 120ms;
	}
	.room-clear:hover {
		color: #c0392b;
	}
	.room-note {
		max-width: 42rem;
		color: var(--muted);
		font-size: 0.75rem;
		line-height: 1.6;
	}
</style>

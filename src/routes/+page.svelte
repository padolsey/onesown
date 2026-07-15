<script lang="ts">
	import type { Component } from 'svelte';
	import { version } from '$app/environment';
	import { doc, type ShellId } from '$lib/state.svelte';
	import { prefs } from '$lib/prefs.svelte';
	import { shellList } from '$lib/shells';
	import Bare from '$lib/shells/Bare.svelte';
	import Scratch from '$lib/shells/Scratch.svelte';
	import Pad from '$lib/shells/Pad.svelte';
	import Term from '$lib/shells/Term.svelte';
	import Mail from '$lib/shells/Mail.svelte';
	import Doc from '$lib/shells/Doc.svelte';
	import Post from '$lib/shells/Post.svelte';
	import Yours from '$lib/shells/Yours.svelte';

	const shellViews: Record<ShellId, Component> = {
		bare: Bare,
		scratch: Scratch,
		pad: Pad,
		term: Term,
		mail: Mail,
		doc: Doc,
		post: Post,
		yours: Yours
	};
	const ShellView = $derived(shellViews[doc.shell]);

	let isMac = $state(false);
	let showAbout = $state(false);

	$effect(() => {
		doc.load();
		prefs.load();
		isMac = /Mac|iP(hone|ad|od)/.test(navigator.platform);
		return () => doc.flush();
	});

	// Theme override reaches the document root so scrollbars, form controls and
	// overscroll match (html[data-theme] rules live in app.css).
	$effect(() => {
		if (prefs.theme === 'system') delete document.documentElement.dataset.theme;
		else document.documentElement.dataset.theme = prefs.theme;
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
		const mod = e.metaKey || e.ctrlKey;
		if (mod && !e.shiftKey && !e.altKey && (e.key.toLowerCase() === 's' || e.code === 'KeyS')) {
			e.preventDefault();
			if (e.repeat) return;
			void doc.saveToDisk();
			return;
		}
		if (mod && !e.shiftKey && !e.altKey && e.key === '.') {
			e.preventDefault();
			prefs.focus = !prefs.focus;
			return;
		}
		// Escape leaves focus mode — unless something closer (a menu, a dialog)
		// is what the writer is escaping from.
		if (e.key === 'Escape' && prefs.focus) {
			if (!document.querySelector('[role="dialog"], [role="menu"]')) prefs.focus = false;
		}
	}

	function onVisibilityChange() {
		if (document.visibilityState === 'hidden') doc.flush();
	}
</script>

<svelte:head>
	<title>A Room of One’s Own — change the room your writing lives in</title>
	<meta
		name="description"
		content="A notepad with interchangeable rooms — write the same draft inside a quiet page, a scratch file, a legal pad, a terminal, an unsent email, an office doc, or a tiny post box, and notice what each room does to your voice."
	/>
	<link rel="canonical" href="https://onesown.app/" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://onesown.app/" />
	<meta property="og:title" content="A Room of One’s Own" />
	<meta property="og:description" content="One draft, eight rooms. A notepad that swaps the app around your words." />
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content="A Room of One’s Own" />
	<meta name="twitter:description" content="One draft, eight rooms. A notepad that swaps the app around your words." />
</svelte:head>

<svelte:window onkeydown={onKeydown} onbeforeunload={() => doc.flush()} />
<svelte:document onvisibilitychange={onVisibilityChange} />

<div
	class="room-app flex min-h-dvh flex-col"
	class:theme-dark={prefs.theme === 'dark'}
	class:theme-light={prefs.theme === 'light'}
>
	{#if !prefs.focus}
		<header class="room-top flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pb-1.5 pt-2 sm:px-4">
			<h1 class="room-wordmark">A Room of One’s Own</h1>
			<div
				class="order-3 -mx-1 flex w-full gap-1.5 overflow-x-auto px-1 pb-0.5 sm:order-none sm:w-auto sm:pb-0"
				role="group"
				aria-label="Rooms"
			>
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
			<div class="ml-auto flex items-center gap-x-2">
				<span class="room-status hidden md:inline">{statusText}</span>
				<span class="sr-only" aria-live="polite">
					{doc.diskNote ?? (doc.saveState === 'error' ? 'Couldn’t autosave' : '')}
				</span>
				{#if prefs.goal}
					<span
						class="room-status tabular-nums"
						class:goal-met={doc.words >= prefs.goal}
						title="Word goal">{doc.words}/{prefs.goal}w{doc.words >= prefs.goal ? ' ✓' : ''}</span
					>
				{/if}
				<details class="room-prefs relative">
					<summary class="room-btn" aria-label="Preferences" title="Preferences">⚙</summary>
					<div class="prefs-panel">
						<fieldset>
							<legend>Theme</legend>
							{#each ['system', 'light', 'dark'] as const as t (t)}
								<label
									><input
										type="radio"
										name="theme"
										checked={prefs.theme === t}
										onchange={() => (prefs.theme = t)}
									/>
									{t}</label
								>
							{/each}
						</fieldset>
						<label class="prefs-row">
							<input
								type="checkbox"
								checked={prefs.typewriter}
								onchange={(e) => (prefs.typewriter = e.currentTarget.checked)}
							/>
							Typewriter scrolling
						</label>
						<label class="prefs-row">
							Word goal
							<input
								class="prefs-num"
								type="number"
								min="0"
								step="50"
								placeholder="none"
								value={prefs.goal ?? ''}
								onchange={(e) => (prefs.goal = Number(e.currentTarget.value) || null)}
							/>
						</label>
						{#if doc.shell === 'pad'}
							<fieldset>
								<legend>This room · paper</legend>
								{#each ['yellow', 'white'] as const as v (v)}
									<label
										><input
											type="radio"
											name="pad-paper"
											checked={prefs.padPaper === v}
											onchange={() => (prefs.padPaper = v)}
										/>
										{v}</label
									>
								{/each}
							</fieldset>
						{:else if doc.shell === 'term'}
							<fieldset>
								<legend>This room · phosphor</legend>
								{#each ['green', 'amber'] as const as v (v)}
									<label
										><input
											type="radio"
											name="term-phosphor"
											checked={prefs.termPhosphor === v}
											onchange={() => (prefs.termPhosphor = v)}
										/>
										{v}</label
									>
								{/each}
							</fieldset>
						{:else if doc.shell === 'post'}
							<fieldset>
								<legend>This room · limit</legend>
								{#each [280, 500] as const as v (v)}
									<label
										><input
											type="radio"
											name="post-limit"
											checked={prefs.postLimit === v}
											onchange={() => (prefs.postLimit = v)}
										/>
										{v}</label
									>
								{/each}
							</fieldset>
						{/if}
					</div>
				</details>
				<button
					type="button"
					class="room-btn"
					aria-pressed={prefs.focus}
					title="Focus mode ({isMac ? '⌘.' : 'Ctrl+.'} — Esc to leave)"
					onclick={() => (prefs.focus = true)}
				>
					Focus
				</button>
				<button
					type="button"
					class="room-btn"
					title="Save to disk ({isMac ? '⌘S' : 'Ctrl+S'})"
					onclick={() => void doc.saveToDisk()}
				>
					Save
					<kbd>{isMac ? '⌘S' : 'Ctrl+S'}</kbd>
				</button>
				<button type="button" onclick={() => doc.requestClear()} class="room-clear">Clear</button>
			</div>
		</header>
	{/if}

	<main class="room-main flex-1 p-2 sm:p-3">
		<ShellView />
	</main>

	{#if !prefs.focus}
		<footer class="room-foot px-3 pb-1.5 sm:px-4">
			{#if showAbout}
				<p class="room-note mb-1 max-w-2xl">
					One draft, eight rooms — what you write is shaped by what you write <em>into</em>.
					Nothing you write leaves this page: the draft autosaves to this browser’s local storage,
					and Save to disk writes a plain .txt file (browsers without the File System Access API
					download one instead). Formatting lives in the draft as plain markers (**bold**,
					*italics*) — rooms that can render it do, and rooms that can’t show the markers. Works
					offline once visited.
				</p>
			{/if}
			<p class="room-note flex flex-wrap items-center gap-x-1.5">
				<button
					type="button"
					class="room-link"
					aria-expanded={showAbout}
					onclick={() => (showAbout = !showAbout)}
				>
					About
				</button>
				<span aria-hidden="true">·</span>
				<a class="room-link" href="https://github.com/padolsey/onesown">Source</a>
				<span aria-hidden="true">·</span>
				<a class="room-link" href="/verify">Verify <code>{version.slice(0, 7)}</code></a>
				<span aria-hidden="true">·</span>
				<span>by <a class="room-link" href="https://j11y.io">James Padolsey</a></span>
			</p>
		</footer>
	{:else}
		<button
			type="button"
			class="focus-exit"
			aria-label="Exit focus mode"
			title="Exit focus mode (Esc)"
			onclick={() => (prefs.focus = false)}
		>
			esc
		</button>
	{/if}
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
	/* The writing area. Rooms that fill (every one but Post) stretch to this
	   box, so nothing measures the chrome — the flex column above already did.
	   `safe` keeps a room that outgrows the viewport reachable from its top
	   rather than centred and clipped. */
	.room-main {
		display: flex;
		flex-direction: column;
		justify-content: safe center;
	}
	@media (prefers-color-scheme: dark) {
		.room-app:not(.theme-light) {
			--bg: #191817;
			--fg: #e6e1d7;
			--muted: #98917f;
			--line: #383530;
		}
	}
	.room-app.theme-dark {
		--bg: #191817;
		--fg: #e6e1d7;
		--muted: #98917f;
		--line: #383530;
	}
	.room-wordmark {
		font-family: Georgia, 'Times New Roman', serif;
		font-style: italic;
		font-size: 1.05rem;
		font-weight: 700;
		letter-spacing: -0.01em;
		white-space: nowrap;
	}
	.room-tab {
		flex-shrink: 0;
		border: 1px solid var(--line);
		border-radius: 9999px;
		padding: 0.25rem 0.7rem;
		font-size: 0.8rem;
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
		font-size: 0.7rem;
	}
	.goal-met {
		color: #4c7a45;
	}
	.room-app.theme-dark .goal-met,
	.room-app:not(.theme-light) .goal-met {
		color: inherit;
	}
	.room-btn {
		display: inline-flex;
		align-items: center;
		border: 1px solid var(--line);
		border-radius: 0.4rem;
		padding: 0.25rem 0.55rem;
		font-size: 0.7rem;
		font-weight: 500;
		color: var(--fg);
		cursor: pointer;
		transition: border-color 120ms;
	}
	.room-btn:hover {
		border-color: var(--muted);
	}
	.room-btn kbd {
		margin-left: 0.35rem;
		border: 1px solid var(--line);
		border-radius: 0.25rem;
		padding: 0 0.2rem;
		font-size: 0.6rem;
		color: var(--muted);
	}
	.room-clear {
		padding: 0.25rem 0.4rem;
		font-size: 0.7rem;
		color: var(--muted);
		transition: color 120ms;
	}
	.room-clear:hover {
		color: #c0392b;
	}
	.room-note {
		color: var(--muted);
		font-size: 0.7rem;
		line-height: 1.5;
	}
	.room-link {
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.room-link:hover {
		color: var(--fg);
	}
	/* Preferences popover */
	.room-prefs summary {
		list-style: none;
		user-select: none;
	}
	.room-prefs summary::-webkit-details-marker {
		display: none;
	}
	.prefs-panel {
		position: absolute;
		right: 0;
		top: calc(100% + 0.35rem);
		z-index: 30;
		min-width: 13rem;
		border: 1px solid var(--line);
		border-radius: 0.5rem;
		background: var(--bg);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
		padding: 0.7rem 0.8rem;
		font-size: 0.75rem;
		display: grid;
		gap: 0.55rem;
	}
	.prefs-panel fieldset {
		border: none;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.15rem 0.7rem;
	}
	.prefs-panel legend {
		color: var(--muted);
		font-size: 0.65rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 0;
		margin-bottom: 0.15rem;
	}
	.prefs-panel label {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	.prefs-row {
		display: flex;
	}
	.prefs-num {
		width: 4.5rem;
		border: 1px solid var(--line);
		border-radius: 0.3rem;
		background: transparent;
		padding: 0.1rem 0.3rem;
		margin-left: auto;
	}
	/* Focus-mode exit affordance (touch has no Esc key) */
	.focus-exit {
		position: fixed;
		right: 0.6rem;
		top: 0.6rem;
		z-index: 40;
		border: 1px solid var(--line);
		border-radius: 9999px;
		background: var(--bg);
		color: var(--muted);
		font-size: 0.65rem;
		padding: 0.3rem 0.6rem;
		opacity: 0.4;
		transition: opacity 120ms;
	}
	.focus-exit:hover,
	.focus-exit:focus-visible {
		opacity: 1;
	}
	/* Comfortable touch targets; the ⌘S hint is meaningless on touch. */
	@media (pointer: coarse) {
		.room-tab {
			padding: 0.5rem 0.9rem;
		}
		.room-btn,
		.room-clear {
			padding: 0.45rem 0.7rem;
		}
		.room-btn kbd {
			display: none;
		}
		.focus-exit {
			opacity: 0.7;
			padding: 0.5rem 0.8rem;
		}
	}
</style>

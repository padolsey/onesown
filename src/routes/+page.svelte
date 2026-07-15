<script lang="ts">
	import { untrack, type Component } from 'svelte';
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
	let roomStrip = $state<HTMLDivElement | null>(null);

	// Eight pills don't fit a phone, so the strip scrolls — and it always started
	// at the left. The room is restored from the last session, so a writer who left
	// off in Post or Yours came back to five unpressed pills and no selection
	// anywhere: the app's own navigation showing nothing at all, every session.
	//
	// Both reads are load-bearing. `doc.shell` re-centres when the room changes;
	// `roomStrip` re-runs this when the header remounts, which is the other way the
	// scroll is lost — leaving focus mode rebuilds the strip at zero, so a writer
	// who swiped to find Yours lost it again on every ⌘.
	//
	// Measured from rects rather than offsetLeft: the strip isn't a positioned
	// ancestor, so offsetLeft answers a question about some element further up.
	$effect(() => {
		const strip = roomStrip;
		const active = strip?.querySelector<HTMLElement>(`button[data-room="${doc.shell}"]`);
		if (!strip || !active) return;
		const stripBox = strip.getBoundingClientRect();
		const activeBox = active.getBoundingClientRect();
		strip.scrollLeft +=
			activeBox.left - stripBox.left - (stripBox.width - activeBox.width) / 2;
	});

	// Mount/unmount only. Without untrack this reads the draft (load() checks it)
	// and so re-runs on every keystroke — tearing down into doc.flush() each
	// time, which wrote the whole draft to localStorage per character and
	// defeated the save debounce entirely.
	// (prefs.load() and the theme override live in +layout.svelte — they belong
	// to the writer, not to this page.)
	$effect(() => {
		untrack(() => {
			doc.load();
			isMac = /Mac|iP(hone|ad|od)/.test(navigator.platform);
		});
		return () => doc.flush();
	});

	// Reassurance only, and it earns its place in the topbar only where there's
	// room. Anything the writer must actually act on goes to the notice below,
	// which is visible at every width and in focus mode.
	const statusText = $derived(
		doc.saveState === 'pending'
			? 'Saving…'
			: doc.saveState === 'saved'
				? 'Saved in this browser'
				: 'Autosaves as you type'
	);

	// The one surface for things that went wrong or just happened. Disk notes
	// expire on their own; a conflict or a failed autosave persists, because the
	// writer's words are at stake and a 3s toast is not an answer to that.
	let dismissedNotice = $state<string | null>(null);
	const noticeText = $derived(
		doc.diskNote ??
			(doc.conflict
				? 'This draft changed in another tab. Not saving, so neither copy is lost.'
				: doc.saveState === 'error'
					? 'Couldn’t autosave — this draft is only in this tab.'
					: null)
	);
	const notice = $derived(noticeText !== null && noticeText !== dismissedNotice ? noticeText : null);
	// Disk notes retire themselves; the rest stay until dealt with.
	const noticeSticky = $derived(notice !== null && doc.diskNote === null);

	// Focus mode means the writing owns the screen, and the browser's own chrome
	// is half of what's in the way. requestFullscreen needs a user gesture —
	// every path to here has one. Where it's unsupported (iPhone) or refused,
	// hiding our own chrome still stands on its own.
	async function setFocus(on: boolean) {
		prefs.focus = on;
		try {
			if (on) await document.documentElement.requestFullscreen?.();
			else if (document.fullscreenElement) await document.exitFullscreen();
		} catch {
			// refused or unavailable — focus mode is still worth having
		}
	}

	// Leaving fullscreen by any other route (F11, the browser's own Esc) must
	// not strand the writer in a focus mode they believe they've left.
	function onFullscreenChange() {
		if (!document.fullscreenElement && prefs.focus) prefs.focus = false;
	}

	/**
	 * Which letter the writer actually pressed.
	 *
	 * `e.key` is what the layout produced — the letter on the keycap. `e.code` is
	 * the physical US-QWERTY position, which on a permuted Latin layout is a
	 * different letter entirely. Testing both with `||` was harmless when S was
	 * the only shortcut and wrong the moment there were four: on QWERTZ, Ctrl+Y
	 * arrives as key='y', code='KeyZ', matched the Z branch first, and undid. On
	 * Colemak it opened the file picker. Dvorak's Ctrl+R couldn't reload the page
	 * and Ctrl+F couldn't find, because both sit on QWERTY's O and Y.
	 *
	 * So believe the layout when it gave us a Latin letter, and fall back to
	 * position only when it didn't — which is the case the fallback was added for:
	 * Cyrillic Ctrl+я still has to undo. One letter, so the branches below are
	 * disjoint by construction rather than by ordering.
	 */
	function pressedLetter(e: KeyboardEvent): string {
		const key = e.key.toLowerCase();
		if (/^[a-z]$/.test(key)) return key;
		return /^Key([A-Z])$/.exec(e.code)?.[1].toLowerCase() ?? '';
	}

	function onKeydown(e: KeyboardEvent) {
		const mod = e.metaKey || e.ctrlKey;
		// Alt-combinations never reach the branches below, which is what keeps
		// macOS Option-composed characters (⌥z is Ω) out of the Latin test.
		const letter = pressedLetter(e);
		if (mod && !e.shiftKey && !e.altKey && letter === 's') {
			e.preventDefault();
			if (e.repeat) return;
			void doc.saveToDisk();
			return;
		}
		if (mod && !e.shiftKey && !e.altKey && letter === 'o') {
			e.preventDefault();
			if (e.repeat) return;
			void doc.openFromDisk();
			return;
		}
		// We own undo: a textarea's native stack dies with the element on every
		// room switch, but the draft crossing rooms is the whole point — so its
		// history has to outlive the room that showed it.
		if (mod && !e.altKey && letter === 'z') {
			// The goal field is an ordinary number input; leave it native.
			if (e.target instanceof HTMLInputElement) return;
			e.preventDefault();
			if (e.shiftKey) doc.redo();
			else doc.undo();
			return;
		}
		if (mod && !e.shiftKey && !e.altKey && letter === 'y') {
			if (e.target instanceof HTMLInputElement) return;
			e.preventDefault();
			doc.redo();
			return;
		}
		if (mod && !e.shiftKey && !e.altKey && e.key === '.') {
			e.preventDefault();
			void setFocus(!prefs.focus);
			return;
		}
		// Escape leaves focus mode — unless something closer (a menu, a dialog)
		// is what the writer is escaping from.
		if (e.key === 'Escape' && prefs.focus) {
			if (!document.querySelector('[role="dialog"], [role="menu"]')) void setFocus(false);
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
<svelte:document onvisibilitychange={onVisibilityChange} onfullscreenchange={onFullscreenChange} />

<div
	class="room-app flex min-h-dvh flex-col"
	class:theme-dark={prefs.theme === 'dark'}
	class:theme-light={prefs.theme === 'light'}
>
	{#if !prefs.focus}
		<header class="room-top flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pb-1.5 pt-2 sm:px-4">
			<h1 class="room-wordmark">A Room of One’s Own</h1>
			<div
				bind:this={roomStrip}
				class="order-3 -mx-1 flex w-full gap-1.5 overflow-x-auto px-1 pb-0.5 sm:order-none sm:w-auto sm:pb-0"
				role="group"
				aria-label="Rooms"
			>
				{#each shellList as s (s.id)}
					<button
						type="button"
						data-room={s.id}
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
				<!-- Clear is the one destructive action, and touch has no ⌘Z — so the
				     way back has to be visible, not just a shortcut. Expires on its own.
				     Restores the cleared draft specifically, so it stays true to its
				     label even if the writer has started typing again. -->
				{#if doc.justCleared}
					<button type="button" class="room-undo" onclick={() => doc.restoreCleared()}>
						Undo clear
					</button>
				{/if}
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
					title="Focus mode — full screen ({isMac ? '⌘.' : 'Ctrl+.'} — Esc to leave)"
					onclick={() => void setFocus(true)}
				>
					Focus
				</button>
				<button
					type="button"
					class="room-btn"
					title="Open a file ({isMac ? '⌘O' : 'Ctrl+O'})"
					onclick={() => void doc.openFromDisk()}
				>
					Open
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

	<!-- Outside the focus-mode gate on purpose: a writer can sit in focus mode for
	     a long stretch, and "your draft isn't saving" is exactly the thing they
	     must not miss. Carries the live region too, for the same reason. -->
	<span class="sr-only" aria-live="polite">
		{doc.justCleared ? 'Draft cleared. Undo is available.' : (notice ?? '')}
	</span>
	{#if notice}
		<div class="room-notice">
			<span>{notice}</span>
			{#if doc.conflict}
				<button type="button" class="notice-action" onclick={() => doc.keepThisCopy()}>
					Keep this one
				</button>
			{/if}
			{#if noticeSticky}
				<button
					type="button"
					class="notice-close"
					aria-label="Dismiss notice"
					onclick={() => (dismissedNotice = noticeText)}
				>
					×
				</button>
			{/if}
		</div>
	{/if}

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
			title="Exit focus mode"
			onclick={() => void setFocus(false)}
		>
			<span class="exit-key">esc</span>
			<span class="exit-touch">Done</span>
		</button>
	{/if}
</div>


<style>
	.room-app {
		--bg: #f2efe9;
		--fg: #2f2b25;
		--muted: #6c6456;
		--line: #d9d3c7;
		/* AA against --bg in both themes; the Undo offer must not be decorative. */
		--undo: #9a5b1e;
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
			--undo: #d8a25e;
		}
	}
	.room-app.theme-dark {
		--bg: #191817;
		--fg: #e6e1d7;
		--muted: #98917f;
		--line: #383530;
		--undo: #d8a25e;
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
	/* The global ring is `currentColor`, but this tab inverts its text to the
	   topbar's own colour — so the ring would be painted in the surface it sits
	   on (1:1, invisible), and it's the first thing Tab lands on. Ring in --fg
	   instead, offset clear of the tab's own --fg fill. Deliberately not a global
	   token: rooms like Term paint their own surface without redefining --fg, and
	   there `currentColor` is already right. */
	.room-tab[aria-pressed='true']:focus-visible {
		outline-color: var(--fg);
		outline-offset: 3px;
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
	/* Transient way back from Clear. Reads as an offer, not chrome — it leaves
	   again on its own once the moment of regret has passed. */
	.room-undo {
		display: inline-flex;
		align-items: center;
		border: 1px solid currentColor;
		border-radius: 0.4rem;
		padding: 0.25rem 0.55rem;
		font-size: 0.7rem;
		font-weight: 500;
		color: var(--undo);
		cursor: pointer;
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
	/* The notice. Chrome, but it draws nothing until there is something to say —
	   so the writing surface still owns the viewport in the steady state.
	   Painted as its own scrim rather than from the room's palette: it is a
	   sibling of <main>, so it can land on Bare's cream or Term's near-black and
	   must read on both. */
	.room-notice {
		position: fixed;
		left: 50%;
		bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
		transform: translateX(-50%);
		z-index: 45;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		max-width: min(30rem, calc(100vw - 1.6rem));
		border-radius: 0.5rem;
		background: rgba(20, 19, 18, 0.92);
		color: #f4f1ea;
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
		padding: 0.5rem 0.75rem;
		font-size: 0.75rem;
		line-height: 1.4;
	}
	.notice-action,
	.notice-close {
		flex-shrink: 0;
		border-radius: 0.3rem;
		color: inherit;
		cursor: pointer;
	}
	.notice-action {
		border: 1px solid rgba(244, 241, 234, 0.5);
		padding: 0.15rem 0.45rem;
		font-weight: 500;
	}
	.notice-action:hover {
		border-color: #f4f1ea;
	}
	.notice-close {
		padding: 0 0.25rem;
		font-size: 0.95rem;
		line-height: 1;
	}
	.notice-action:focus-visible,
	.notice-close:focus-visible {
		outline-color: #f4f1ea;
	}
	@media (pointer: coarse) {
		.notice-action {
			padding: 0.4rem 0.6rem;
		}
		.notice-close {
			padding: 0.3rem 0.5rem;
		}
	}
	/* Focus-mode exit affordance (touch has no Esc key) */
	/*
	 * The way out of focus mode, and on an iPhone the ONLY way out — there is no
	 * Esc key and no Fullscreen API to leave.
	 *
	 * It used to fade itself to 0.4 to keep out of the way, which is the one thing
	 * it must not do. Group opacity dilutes the text AND the background together,
	 * and its background was --bg, the very colour of the page behind it: it faded
	 * toward its own backdrop and measured 1.78:1 on a light OS, 2.9:1 on touch
	 * where hover never arrives and 0.7 is therefore the resting state. Opacity was
	 * the whole defect; the palette was never the problem.
	 *
	 * It also drew itself from the chrome palette while sitting on the room's
	 * surface — it's a sibling of <main>, not a descendant of any room — so it
	 * matched the paper only by luck, and landed as a dark blob on Bare's cream or
	 * a pale lozenge on Term's near-black depending on the OS theme.
	 *
	 * Both go away with one move: its own scrim, dark and translucent, carrying its
	 * own light text. The alpha lets the room show through so it still recedes,
	 * while the label stays fully opaque and legible; and being independent of both
	 * palettes, it reads the same on cream paper and on a terminal.
	 */
	.focus-exit {
		position: fixed;
		right: 0.6rem;
		top: 0.6rem;
		z-index: 40;
		border: 1px solid rgba(244, 241, 234, 0.35);
		border-radius: 9999px;
		background: rgba(20, 19, 18, 0.78);
		color: #f4f1ea;
		font-size: 0.65rem;
		padding: 0.3rem 0.6rem;
		transition: background 120ms;
	}
	.focus-exit:hover,
	.focus-exit:focus-visible {
		background: rgba(20, 19, 18, 0.95);
	}
	/* "esc" is a hint, and hints have to be true: there is no Esc key on a phone. */
	.exit-touch {
		display: none;
	}
	/* Comfortable touch targets; the ⌘S hint is meaningless on touch. */
	@media (pointer: coarse) {
		.exit-key {
			display: none;
		}
		.exit-touch {
			display: inline;
		}
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
			padding: 0.5rem 0.8rem;
		}
	}
</style>

<script lang="ts">
	import Editor from '../Editor.svelte';
	import { doc } from '../state.svelte';

	let openMenu = $state<string | null>(null);
	let wordWrap = $state(true);
	let statusBar = $state(true);
	let showAbout = $state(false);
	let dialogEl = $state<HTMLDivElement | null>(null);
	let menuButtons = $state<Record<string, HTMLButtonElement>>({});

	$effect(() => {
		if (showAbout && dialogEl) dialogEl.focus();
	});

	function closeAbout() {
		showAbout = false;
		menuButtons['Help']?.focus();
	}

	function trapTab(e: KeyboardEvent) {
		if (e.key !== 'Tab' || !dialogEl) return;
		e.preventDefault();
		const focusables = Array.from(dialogEl.querySelectorAll<HTMLButtonElement>('button'));
		if (focusables.length === 0) return;
		const idx = focusables.indexOf(document.activeElement as HTMLButtonElement);
		const next = e.shiftKey
			? idx <= 0
				? focusables.length - 1
				: idx - 1
			: idx === focusables.length - 1
				? 0
				: idx + 1;
		focusables[next].focus();
	}

	interface MenuItem {
		label: string;
		action: () => void;
		checked?: () => boolean;
	}

	const menus: { name: string; items: MenuItem[] }[] = [
		{
			name: 'File',
			items: [
				{ label: 'New', action: () => doc.requestClear() },
				{ label: 'Save…', action: () => void doc.saveToDisk() }
			]
		},
		{ name: 'Edit', items: [{ label: 'Select All', action: selectAll }] },
		{
			name: 'Format',
			items: [{ label: 'Word Wrap', action: () => (wordWrap = !wordWrap), checked: () => wordWrap }]
		},
		{
			name: 'View',
			items: [{ label: 'Status Bar', action: () => (statusBar = !statusBar), checked: () => statusBar }]
		},
		{ name: 'Help', items: [{ label: 'About Scratchpad', action: () => (showAbout = true) }] }
	];

	function selectAll() {
		const ta = document.querySelector('.scratch-body textarea') as HTMLTextAreaElement | null;
		ta?.focus();
		ta?.select();
	}

	function toggleMenu(e: MouseEvent, name: string) {
		e.stopPropagation();
		openMenu = openMenu === name ? null : name;
	}

	function runItem(item: MenuItem) {
		openMenu = null;
		item.action();
	}

	function onWindowKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			openMenu = null;
			if (showAbout) closeAbout();
		}
	}
</script>

<svelte:window onclick={() => (openMenu = null)} onkeydown={onWindowKeydown} />

<section
	class="bevel-out mx-auto max-w-3xl bg-[#c0c0c0] p-[3px] shadow-[4px_4px_0_rgba(0,0,0,0.25)]"
	style="font-family: Tahoma, 'Segoe UI', 'MS Sans Serif', sans-serif;"
>
	<header
		class="flex items-center gap-2 px-1.5 py-1 text-white"
		style="background: linear-gradient(90deg, #000080, #1084d0);"
	>
		<span class="flex-1 select-none text-[12px] font-bold tracking-tight">untitled.txt — scratchpad</span>
		<span class="flex gap-[2px]" aria-hidden="true">
			<span class="btn95">–</span>
			<span class="btn95">□</span>
			<span class="btn95">✕</span>
		</span>
	</header>
	<nav class="flex gap-0.5 px-1 py-0.5 text-[12px] text-black" aria-label="Scratchpad menu">
		{#each menus as menu (menu.name)}
			<span class="relative">
				<button
					type="button"
					bind:this={menuButtons[menu.name]}
					class="select-none px-1.5 py-[1px] {openMenu === menu.name ? 'bg-[#000080] text-white' : 'hover:bg-[#d6d3ce]'}"
					aria-haspopup="menu"
					aria-expanded={openMenu === menu.name}
					onclick={(e) => toggleMenu(e, menu.name)}
					onmouseenter={() => {
						if (openMenu) openMenu = menu.name;
					}}
				>
					{menu.name}
				</button>
				{#if openMenu === menu.name}
					<div class="bevel-out absolute left-0 top-full z-20 min-w-[160px] bg-[#c0c0c0] py-[2px]" role="menu">
						{#each menu.items as item (item.label)}
							<button
								type="button"
								role="menuitem"
								class="block w-full px-2 py-[3px] text-left text-[12px] hover:bg-[#000080] hover:text-white"
								onclick={(e) => {
									e.stopPropagation();
									runItem(item);
								}}
							>
								<span class="inline-block w-3.5">{item.checked?.() ? '✓' : ''}</span>{item.label}
							</button>
						{/each}
					</div>
				{/if}
			</span>
		{/each}
	</nav>
	<div class="bevel-in scratch-body bg-white">
		<div
			class="px-2 py-1.5 text-[13.5px] leading-[1.45] text-black"
			style="font-family: Consolas, 'Lucida Console', 'Courier New', monospace; --editor-caret: #000000; --editor-selection: #000080; --editor-selection-fg: #ffffff; --editor-min: 50vh;"
		>
			<Editor label="Draft — scratch file" nowrap={!wordWrap} />
		</div>
	</div>
	{#if statusBar}
		<footer class="sticky bottom-0 flex gap-[3px] bg-[#c0c0c0] px-[2px] py-[2px] text-[11.5px] text-black">
			<span class="bevel-in flex-1 px-2 py-0.5">Ln {doc.line}, Col {doc.col}</span>
			<span class="bevel-in px-2 py-0.5">{doc.chars} chars</span>
			<span class="bevel-in px-2 py-0.5">UTF-8</span>
		</footer>
	{/if}
</section>

{#if showAbout}
	<div
		class="fixed inset-0 z-40 flex items-center justify-center bg-black/20 p-4"
		onclick={closeAbout}
		onkeydown={(e) => {
			if (e.key === 'Escape') closeAbout();
		}}
		role="presentation"
	>
		<div
			bind:this={dialogEl}
			class="bevel-out w-72 bg-[#c0c0c0] p-[3px] shadow-[4px_4px_0_rgba(0,0,0,0.25)]"
			style="font-family: Tahoma, 'Segoe UI', 'MS Sans Serif', sans-serif;"
			role="dialog"
			aria-modal="true"
			aria-label="About Scratchpad"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => {
				e.stopPropagation();
				if (e.key === 'Escape') closeAbout();
				trapTab(e);
			}}
		>
			<header
				class="flex items-center px-1.5 py-1 text-white"
				style="background: linear-gradient(90deg, #000080, #1084d0);"
			>
				<span class="flex-1 select-none text-[12px] font-bold">About Scratchpad</span>
				<button type="button" class="btn95" aria-label="Close" onclick={closeAbout}>✕</button>
			</header>
			<div class="px-4 py-4 text-[12px] text-black">
				<p class="font-bold">Scratchpad</p>
				<p class="mt-1">A room of one’s own. Words written here don’t count.</p>
				<p class="mt-1 text-[11px]">Your draft lives in this browser only.</p>
				<div class="mt-4 flex justify-center">
					<button
						type="button"
						class="bevel-out bg-[#c0c0c0] px-6 py-0.5 text-[12px] active:border-[#6d6d6d_#ffffff_#ffffff_#6d6d6d]"
						onclick={closeAbout}
					>
						OK
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.bevel-out {
		border: 2px solid;
		border-color: #ffffff #6d6d6d #6d6d6d #ffffff;
	}
	.bevel-in {
		border: 2px solid;
		border-color: #6d6d6d #ffffff #ffffff #6d6d6d;
	}
	.btn95 {
		display: flex;
		width: 18px;
		height: 16px;
		align-items: center;
		justify-content: center;
		border: 2px solid;
		border-color: #ffffff #6d6d6d #6d6d6d #ffffff;
		background: #c0c0c0;
		color: #000000;
		font-size: 9px;
		line-height: 1;
	}
</style>

<script lang="ts">
	import Editor from '../Editor.svelte';
	import { prefs } from '../prefs.svelte';

	// Paper variant (Preferences → This room): classic yellow or white pad.
	const paper = $derived(
		prefs.padPaper === 'white'
			? { bg: '#fcfcf7', strip: '#e9e9e0', stripLine: '#d6d6c8' }
			: { bg: '#fdf6a8', strip: '#e7d67f', stripLine: '#d9c76a' }
	);
</script>

<section
	class="mx-auto max-w-2xl overflow-hidden rounded-md shadow-lg shadow-stone-900/20"
	style="background: {paper.bg};"
>
	<div class="h-3 border-b" style="background: {paper.strip}; border-color: {paper.stripLine};"></div>
	<div class="pad-paper">
		<div
			class="pad-ink text-[17px] leading-[28px] text-[#2b4a9e]"
			style="font-family: 'Bradley Hand', 'Segoe Print', 'Comic Sans MS', 'Comic Neue', cursive; --editor-caret: #2b4a9e; --editor-selection: rgba(43, 74, 158, 0.18); --editor-min: max(16rem, calc(100dvh - var(--chrome, 7rem) - 11rem));"
		>
			<Editor label="Draft — legal pad" />
		</div>
	</div>
</section>

<style>
	/* Rules every 28px (matching the 28px line-height); the double red margin
	   tracks --gutter so it stays 18–22px left of the text on any screen. */
	.pad-paper {
		--gutter: clamp(48px, 16vw, 84px);
		background-image:
			linear-gradient(
				to right,
				transparent 0 calc(var(--gutter) - 22px),
				rgba(224, 84, 72, 0.55) calc(var(--gutter) - 22px) calc(var(--gutter) - 21px),
				transparent calc(var(--gutter) - 21px) calc(var(--gutter) - 19px),
				rgba(224, 84, 72, 0.45) calc(var(--gutter) - 19px) calc(var(--gutter) - 18px),
				transparent calc(var(--gutter) - 18px)
			),
			repeating-linear-gradient(to bottom, transparent 0 27px, rgba(96, 128, 187, 0.4) 27px 28px);
	}
	.pad-ink {
		padding: 56px 32px 56px var(--gutter);
	}
	@media (max-width: 640px) {
		.pad-ink {
			padding: 28px 16px 28px var(--gutter);
		}
	}
</style>

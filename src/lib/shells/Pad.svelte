<script lang="ts">
	import Editor from '../Editor.svelte';
</script>

<section class="mx-auto max-w-2xl overflow-hidden rounded-md bg-[#fdf6a8] shadow-lg shadow-stone-900/20">
	<div class="h-3 border-b border-[#d9c76a] bg-[#e7d67f]"></div>
	<div class="pad-paper">
		<div
			class="pad-ink text-[17px] leading-[28px] text-[#2b4a9e]"
			style="font-family: 'Bradley Hand', 'Segoe Print', 'Comic Sans MS', 'Comic Neue', cursive; --editor-caret: #2b4a9e; --editor-selection: rgba(43, 74, 158, 0.18); --editor-min: 60vh;"
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

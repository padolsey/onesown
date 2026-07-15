<script lang="ts">
	import Editor from '../Editor.svelte';
</script>

<section class="rounded-2xl border border-[#e7e1d5] bg-[#fbf9f5] shadow-sm">
	<div
		class="mx-auto max-w-2xl px-6 py-14 text-[17px] leading-[1.75] text-[#403b36] sm:px-8 sm:py-20"
		style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; --editor-caret: #c96442; --editor-selection: rgba(201, 100, 66, 0.18); --editor-min: 55vh;"
	>
		<Editor placeholder="Just write." label="Draft — quiet page" />
	</div>
</section>

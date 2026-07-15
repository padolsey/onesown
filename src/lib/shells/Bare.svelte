<script lang="ts">
	import Editor from '../Editor.svelte';
</script>

<section class="flex flex-1 flex-col rounded-2xl border border-[#e7e1d5] bg-[#fbf9f5] shadow-sm">
	<div
		class="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-10 text-[17px] leading-[1.75] text-[#403b36] sm:px-8 sm:py-14"
		style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; --editor-caret: #c96442; --editor-selection: rgba(201, 100, 66, 0.18); --editor-min: 16rem;"
	>
		<Editor placeholder="Just write." label="Draft — quiet page" markers={true} />
	</div>
</section>

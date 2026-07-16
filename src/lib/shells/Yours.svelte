<script lang="ts">
	import Editor from '../Editor.svelte';
	import { prefs, YOURS_FONTS } from '../prefs.svelte';
	import { inkFor, washFor, type RGB } from '../palette';
	import { photoExtremes, readPhoto } from '../photo';

	// The eighth room: the one place the lighting is yours. Every other room is
	// deliberately not negotiable, which is what buys this one its freedom.
	//
	// The controls are NOT here. They live in the ⚙ popover with every other
	// room's variants, because a room with a settings bar across its writing
	// surface is the one thing none of the other seven do. What is here is the
	// paper, the words, and somewhere to drop a photograph.
	const y = $derived(prefs.yours);

	const hexToRgb = (h: string): RGB => [
		parseInt(h.slice(1, 3), 16),
		parseInt(h.slice(3, 5), 16),
		parseInt(h.slice(5, 7), 16)
	];
	const rgbToHex = ([r, g, b]: RGB) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

	// The photograph's darkest and lightest, which is what the ink has to beat.
	let extremes = $state<[RGB, RGB] | null>(null);

	const paperRgb = $derived(hexToRgb(y.paper));
	// The ink is solved, never stored. This is the room's whole guarantee — and
	// when a photograph is behind the words it is solved against THAT, not against
	// the paper, or the wash gets starved to nothing. See washFor.
	const solved = $derived(
		y.wash && y.photo && extremes
			? washFor(paperRgb, hexToRgb(y.hue), extremes[0], extremes[1])
			: { ink: inkFor(paperRgb, hexToRgb(y.hue)).rgb, opacity: 0 }
	);
	const ink = $derived(rgbToHex(solved.ink));
	const washOpacity = $derived(solved.opacity);
	const width = $derived(y.width === 'wide' ? '46rem' : '34rem');
	const size = $derived(y.size === 's' ? '15px' : y.size === 'l' ? '20px' : '17px');

	$effect(() => {
		const photo = y.photo;
		if (!photo || !y.wash) {
			extremes = null;
			return;
		}
		let live = true;
		void photoExtremes(photo).then((e) => {
			if (live) extremes = e;
		});
		return () => {
			live = false;
		};
	});

	// The photograph lands sharp and full-bleed for a moment, then dissolves and
	// leaves the room it made. Briefly hiding the words is fine; showing them
	// illegibly is not, so the palette snaps at once and only the picture fades.
	let developing = $state(false);
	let developTimer: ReturnType<typeof setTimeout> | null = null;
	let dragging = $state(false);

	async function take(file: File | null | undefined) {
		if (!file) return;
		const room = await readPhoto(file);
		if (!room) return;
		prefs.yours = { ...prefs.yours, paper: room.paper, hue: room.hue, photo: room.photo };
		developing = true;
		if (developTimer) clearTimeout(developTimer);
		developTimer = setTimeout(() => (developing = false), 900);
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		void take(e.dataTransfer?.files?.[0]);
	}
</script>

<!-- Dropping a photograph here is a mouse gesture and an enhancement; the same
     thing is a plain file input in the ⚙, which is the path that works without
     one. The role is what the element is, so the drop handlers have something
     honest to hang on. -->
<section
	aria-label="Your room"
	class="relative flex flex-1 flex-col overflow-clip rounded-2xl border shadow-sm"
	class:dragging
	style="background: {y.paper}; border-color: {ink}22;"
	ondragover={(e) => {
		e.preventDefault();
		dragging = true;
	}}
	ondragleave={() => (dragging = false)}
	ondrop={onDrop}
>
	{#if y.photo && y.wash}
		<!-- The wash. Blurred because a photograph at full strength measures 1.57:1
		     under text, and capped by the engine rather than by taste. -->
		<div
			class="pointer-events-none absolute inset-0 bg-cover bg-center"
			style="background-image: url({y.photo}); opacity: {washOpacity}; filter: blur(22px); transform: scale(1.1);"
			aria-hidden="true"
		></div>
	{/if}
	{#if y.photo && developing}
		<!-- Sharp, full-bleed, and gone: the picture you dropped, before it becomes
		     the room. -->
		<div
			class="develop pointer-events-none absolute inset-0 bg-cover bg-center"
			style="background-image: url({y.photo});"
			aria-hidden="true"
		></div>
	{/if}
	<div
		class="relative mx-auto flex w-full flex-1 flex-col px-6 py-10 leading-[1.75] sm:px-8"
		style="max-width: {width}; font-family: {YOURS_FONTS[y.font]}; font-size: {size}; color: {ink}; --editor-caret: {ink}; --editor-selection: color-mix(in srgb, {ink} 22%, transparent);  --editor-min: 16rem;"
	>
		<Editor autocap placeholder="Your room. Your rules." label="Draft — your room" markers={true} />
	</div>
</section>

<style>
	.dragging {
		outline: 2px dashed currentColor;
		outline-offset: -6px;
	}
	.develop {
		animation: develop 900ms ease-out forwards;
	}
	@keyframes develop {
		0%,
		35% {
			opacity: 1;
		}
		100% {
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.develop {
			animation-duration: 1ms;
		}
	}
</style>

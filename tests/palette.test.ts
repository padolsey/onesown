/**
 * The palette engine makes a promise — every room it builds is legible — so
 * these try to break it rather than to confirm it. The promise is the feature:
 * it is what lets the Yours room hand over the keys without handing over the
 * chance to make text invisible.
 *
 * Run: pnpm test:unit
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	AA,
	contrast,
	derive,
	inkFor,
	luminance,
	washFor,
	oklchToRgb,
	rgbToOklch,
	sampleClusters,
	worstContrast,
	type RGB
} from '../src/lib/palette.ts';

/** Every hue the room offers, plus the extremes that break naive solvers. */
const HUES: RGB[] = [
	[47, 43, 37], // ink
	[43, 74, 158], // blue
	[107, 74, 47], // sepia
	[232, 228, 218], // chalk
	[255, 0, 0],
	[0, 255, 0],
	[0, 0, 255],
	[255, 255, 0],
	[0, 255, 255],
	[255, 0, 255],
	[0, 0, 0],
	[255, 255, 255],
	[128, 128, 128]
];

test('luminance and contrast agree with the WCAG reference points', () => {
	assert.equal(luminance([0, 0, 0]), 0);
	assert.equal(luminance([255, 255, 255]), 1);
	assert.equal(contrast([0, 0, 0], [255, 255, 255]), 21);
	assert.equal(contrast([255, 255, 255], [255, 255, 255]), 1);
});

test('oklch survives a round trip', () => {
	for (const rgb of HUES) {
		const back = oklchToRgb(rgbToOklch(rgb));
		for (let i = 0; i < 3; i++) assert.ok(Math.abs(back[i] - rgb[i]) <= 1, `${rgb} -> ${back}`);
	}
});

// ── The promise ─────────────────────────────────────────────────────────────

test('every paper × hue the room can reach yields a legible ink', () => {
	// A dense sweep of papers, not the four the room ships: the engine has to be
	// right for any paper a photograph might produce, not just curated ones.
	const failures: string[] = [];
	let checked = 0;
	for (let r = 0; r <= 255; r += 15) {
		for (let g = 0; g <= 255; g += 15) {
			for (let b = 0; b <= 255; b += 15) {
				const paper: RGB = [r, g, b];
				for (const hue of HUES) {
					const ink = inkFor(paper, hue);
					checked++;
					const got = contrast(ink.rgb, paper);
					if (got < AA) failures.push(`paper ${paper} hue ${hue} -> ${ink.rgb} at ${got.toFixed(3)}:1`);
				}
			}
		}
	}
	assert.ok(checked > 40000, `only swept ${checked} pairs`);
	assert.deepEqual(failures.slice(0, 5), [], `${failures.length}/${checked} pairs below AA`);
});

test('the solver never falls through to its own floor', () => {
	// The fallback exists because a promise needs a floor. If it ever fires, the
	// proof above is wrong and the comment on inkFor is a lie.
	const fellThrough: string[] = [];
	for (let l = 0; l <= 255; l += 5) {
		for (const hue of HUES) {
			const ink = inkFor([l, l, l], hue);
			if (ink.fallback) fellThrough.push(`grey ${l} + hue ${hue}`);
		}
	}
	assert.deepEqual(fellThrough, []);
});

test('the ink keeps the hue it was asked for where the paper allows', () => {
	// If every answer were black the promise would be trivial and the room dead.
	const plum: RGB = [128, 40, 120];
	const onCream = inkFor([250, 246, 236], plum);
	const onMidnight = inkFor([15, 15, 25], plum);
	assert.ok(onCream.chromaKept > 0.5, `cream kept only ${onCream.chromaKept}`);
	assert.ok(onMidnight.chromaKept > 0.5, `midnight kept only ${onMidnight.chromaKept}`);
	// The same hue resolves dark on light paper and light on dark: that is the
	// whole idea — pigment, not colour.
	assert.ok(luminance(onCream.rgb) < luminance([250, 246, 236]));
	assert.ok(luminance(onMidnight.rgb) > luminance([15, 15, 25]));
});

test('AAA is not promisable, and the engine says so rather than pretending', () => {
	// Black needs paper L >= 0.3, white needs L <= 0.1. Mid-luminance paper has
	// no 7:1 ink at all, which is why the module promises AA. This test exists so
	// that anyone "improving" the target to 7 finds out here instead of in prod.
	const midGrey: RGB = [128, 128, 128];
	const best = HUES.map((h) => contrast(inkFor(midGrey, h, 7).rgb, midGrey)).sort((a, b) => b - a)[0];
	assert.ok(best < 7, `mid grey reached ${best.toFixed(2)}:1 at a 7:1 target — the ceiling moved`);
	// ...and AA on the same paper is comfortable.
	assert.ok(contrast(inkFor(midGrey, [0, 0, 255]).rgb, midGrey) >= AA);
});

// ── The photograph ──────────────────────────────────────────────────────────

test('worstContrast catches an ink hiding inside the backdrop range', () => {
	// The trap the whole wash feature rests on: an ink that clears BOTH ends of
	// the backdrop while some pixel in between matches it exactly.
	//
	// Such an ink only exists in a knife-edge band — it must beat black, so its
	// luminance is >= 0.175, and beat white, so <= 0.1833 — which is the same
	// overlap that makes AA promisable at all, read from the other side. Search
	// for it rather than hardcoding a grey: the band is ~1 step of 8-bit grey
	// wide, and a literal here would be a magic number that rots.
	const greys: RGB[] = Array.from({ length: 256 }, (_, i) => [i, i, i]);
	const straddles = greys.filter(
		(g) => contrast(g, [0, 0, 0]) >= 4.5 && contrast(g, [255, 255, 255]) >= 4.5
	);
	assert.ok(straddles.length > 0, 'no ink clears both ends — the AA overlap has moved');
	for (const ink of straddles) {
		assert.equal(worstContrast(ink, 0, 1), 1, `${ink} clears both ends yet vanishes mid-range`);
	}
	// Outside the range it behaves like ordinary contrast.
	assert.ok(worstContrast([0, 0, 0], 0.5, 0.9) > 4.5);
	assert.ok(worstContrast([255, 255, 255], 0, 0.1) > 4.5);
});

test('the wash can never make the room unreadable', () => {
	// Whatever photograph arrives, the opacity it is allowed must leave ITS ink
	// legible against the composite — not against the bare paper.
	const papers: RGB[] = [[250, 246, 236], [15, 15, 25], [128, 128, 128], [255, 255, 255], [0, 0, 0]];
	const extremes: [RGB, RGB][] = [
		[[0, 0, 0], [255, 255, 255]], // deep shadows AND blown highlights
		[[0, 0, 0], [0, 0, 0]], // all black
		[[255, 255, 255], [255, 255, 255]], // all white
		[[120, 118, 116], [134, 130, 126]], // flat mid-grey
		[[200, 120, 90], [250, 200, 170]] // a sunset
	];
	const mix = (x: RGB, y: RGB, t: number) => x.map((v, i) => v * (1 - t) + y[i] * t) as RGB;
	for (const paper of papers) {
		for (const hue of HUES) {
			for (const [lo, hi] of extremes) {
				const { ink, opacity } = washFor(paper, hue, lo, hi);
				assert.ok(opacity >= 0 && opacity <= 1, `opacity ${opacity} out of range`);
				const l1 = luminance(mix(paper, lo, opacity));
				const l2 = luminance(mix(paper, hi, opacity));
				const got = worstContrast(ink, Math.min(l1, l2), Math.max(l1, l2));
				assert.ok(
					got >= AA - 0.001,
					`paper ${paper} hue ${hue} photo ${lo}..${hi} allowed ${opacity} but measures ${got.toFixed(3)}:1`
				);
			}
		}
	}
});

test('the wash is not starved by solving the ink in the wrong order', () => {
	// The trap this whole function exists for. Solving the ink against the bare
	// paper first yields the GENTLEST passing ink, at 4.500:1 with no margin — so
	// the first drop of photograph eats the allowance and the wash caps near 1%.
	// It looks like the guarantee protecting the writer; it is the order being
	// wrong. A flat photograph of a colour close to the paper must be allowed at
	// full strength, and that is the case the wrong order fails hardest.
	const paper: RGB = [201, 191, 168];
	const flat: RGB = [201, 191, 168];
	const { opacity } = washFor(paper, [47, 43, 37], flat, flat);
	assert.ok(opacity > 0.9, `a flat photo of the paper's own colour was capped at ${opacity}`);
	// A photo with both deep shadows and blown highlights admits no legible ink at
	// any real strength, and must be starved — the same function, opposite answer.
	const harsh = washFor(paper, [47, 43, 37], [0, 0, 0], [255, 255, 255]);
	assert.ok(harsh.opacity < 0.5, `a full-range photo was allowed ${harsh.opacity}`);
});

test('the wash opacity rounds down, never up', () => {
	// toFixed rounds half-up, toward the cliff — which is how a 4.495:1 ships
	// claiming to be 4.5. Everything bounding a guarantee floors.
	const { opacity } = washFor([250, 246, 236], [47, 43, 37], [0, 0, 0], [255, 255, 255]);
	assert.equal(opacity, Math.floor(opacity * 1000) / 1000);
});

test('a photograph makes a legible room, including the degenerate ones', () => {
	const image = (fill: (i: number) => RGB, n = 64) => {
		const px = new Uint8ClampedArray(n * n * 4);
		for (let i = 0; i < n * n; i++) {
			const [r, g, b] = fill(i);
			px.set([r, g, b, 255], i * 4);
		}
		return px;
	};
	const cases: [string, Uint8ClampedArray][] = [
		['all black', image(() => [0, 0, 0])],
		['all white', image(() => [255, 255, 255])],
		['one flat colour', image(() => [90, 140, 90])],
		['mid grey', image(() => [128, 128, 128])],
		['a sunset', image((i) => [200 + (i % 40), 120 + (i % 60), 90 + (i % 30)])],
		['high contrast', image((i) => (i % 2 ? [255, 255, 255] : [0, 0, 0]))]
	];
	for (const [name, px] of cases) {
		const room = derive(px);
		assert.ok(contrast(room.ink, room.paper) >= AA, `${name}: ${contrast(room.ink, room.paper).toFixed(2)}:1`);
	}
});

test('the same photograph always makes the same room', () => {
	// No seed, no k-means, no Date.now: a reload must not redecorate.
	const px = new Uint8ClampedArray(32 * 32 * 4);
	for (let i = 0; i < 32 * 32; i++) px.set([(i * 7) % 256, (i * 13) % 256, (i * 29) % 256, 255], i * 4);
	const a = derive(px);
	const b = derive(px);
	assert.deepEqual(a.paper, b.paper);
	assert.deepEqual(a.ink, b.ink);
});

test('sampleClusters ignores transparent pixels rather than reading them as black', () => {
	const px = new Uint8ClampedArray(4 * 4);
	px.set([255, 0, 0, 255], 0);
	px.set([0, 0, 0, 0], 4);
	px.set([0, 0, 0, 0], 8);
	px.set([0, 0, 0, 0], 12);
	const clusters = sampleClusters(px);
	assert.equal(clusters.length, 1);
	assert.deepEqual(clusters[0].rgb, [255, 0, 0]);
});

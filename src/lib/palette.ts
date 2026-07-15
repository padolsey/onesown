/**
 * The Yours room's colour engine.
 *
 * The eighth room is the one the writer furnishes, and the reason the old one
 * couldn't be trusted with more freedom is that ink was a free choice: half its
 * paper/ink pairs failed AA and `ink on dusk` rendered at 1.10:1. You cannot
 * answer "more customizable" by adding another dropdown to a room that already
 * reaches invisible text.
 *
 * So ink is a hue here, not a colour. The writer picks the character — plum,
 * moss, iron — and the room resolves it against the paper: plum on cream is a
 * deep aubergine, plum on midnight a pale lilac. That is what pigment does, and
 * it means legibility is a property of the engine rather than of the writer's
 * restraint. Freedom goes up and failures go to zero at the same time.
 *
 * The promise is AA (4.5:1) and only AA — see `inkFor` for why 7:1 is not
 * promisable at all. Nothing here is random: the same photograph always yields
 * the same room, because the build and the draft both have to be reproducible.
 */

export type RGB = [number, number, number];
export type OKLCH = [number, number, number];

/** WCAG's threshold for normal text. The only number this module promises. */
export const AA = 4.5;

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gam = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export const luminance = ([r, g, b]: RGB): number =>
	0.2126 * lin(r / 255) + 0.7152 * lin(g / 255) + 0.0722 * lin(b / 255);

export const contrast = (a: RGB, b: RGB): number => {
	const [hi, lo] = [luminance(a), luminance(b)].sort((m, n) => n - m);
	return (hi + 0.05) / (lo + 0.05);
};

// OKLCH rather than HSL because lightness has to mean lightness: HSL's L is a
// lie about perceived brightness, and this engine steers by lightness alone.
export function rgbToOklch([r, g, b]: RGB): OKLCH {
	const R = lin(r / 255);
	const G = lin(g / 255);
	const B = lin(b / 255);
	const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
	const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
	const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
	const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
	const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
	const Bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
	return [L, Math.hypot(A, Bb), (Math.atan2(Bb, A) * 180) / Math.PI];
}

function oklchToLinear([L, C, h]: OKLCH): [number, number, number] {
	const hr = (h * Math.PI) / 180;
	const A = C * Math.cos(hr);
	const B = C * Math.sin(hr);
	const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
	const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
	const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
	return [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
	];
}

export function oklchToRgb(c: OKLCH): RGB {
	return oklchToLinear(c).map((v) => Math.round(Math.min(1, Math.max(0, gam(v))) * 255)) as RGB;
}

/** Representable without clipping? Clipping silently moves luminance, and this
 *  engine's guarantee is a statement about luminance. */
const inGamut = (c: OKLCH) => oklchToLinear(c).every((v) => v >= -0.001 && v <= 1.001);

/** The most chroma this hue can hold at this lightness without clipping. */
function clampChroma([L, C, h]: OKLCH): OKLCH {
	if (inGamut([L, C, h])) return [L, C, h];
	let lo = 0;
	let hi = C;
	for (let i = 0; i < 20; i++) {
		const mid = (lo + hi) / 2;
		if (inGamut([L, mid, h])) lo = mid;
		else hi = mid;
	}
	return [L, lo, h];
}

/**
 * The worst contrast `ink` can have against a backdrop spanning [loLum, hiLum].
 *
 * Checking the two ends is not enough, and this is the trap the whole photograph
 * feature rests on: if the ink's own luminance falls INSIDE the span, some pixel
 * of that backdrop matches the ink almost exactly and contrast collapses to 1 —
 * while both endpoints still measure fine. An ink at L=0.18 over a backdrop
 * running 0→1 scores 4.6 at each end and 1.0 in the middle.
 */
export function worstContrast(ink: RGB, loLum: number, hiLum: number): number {
	const Li = luminance(ink);
	if (Li >= loLum && Li <= hiLum) return 1;
	const c = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
	return Math.min(c(Li, loLum), c(Li, hiLum));
}

export interface Ink {
	rgb: RGB;
	/** How much of the requested hue's chroma survived, 0–1. */
	chromaKept: number;
	/** True if the search fell through to black or white. Should never happen. */
	fallback?: boolean;
}

/**
 * An ink for `paper` in the character of `hue`, meeting `target`.
 *
 * WHY AA IS PROMISABLE AND AAA IS NOT. Black beats any paper whose luminance
 * Lp >= 0.175, since (Lp + 0.05) / 0.05 >= 4.5. White beats any paper with
 * Lp <= 0.1833, since 1.05 / (Lp + 0.05) >= 4.5. Those two ranges OVERLAP, so
 * every paper in existence is covered by at least one of them and a solution
 * always exists. At 7:1 they do not overlap — black needs Lp >= 0.3, white needs
 * Lp <= 0.1 — leaving mid-luminance papers with no legible ink at all. So this
 * promises AA and delivers better where the maths allows. Do not "improve" the
 * target to 7 without moving the paper too; the engine will start failing.
 *
 * `backdrop` lets the paper be a range rather than a colour, which is what a
 * photograph washed behind the text is. Pass [lo, hi] luminance.
 */
export function inkFor(paper: RGB, hue: RGB, target = AA, backdrop?: [number, number]): Ink {
	const [loLum, hiLum] = backdrop ?? [luminance(paper), luminance(paper)];
	const ok = (rgb: RGB) => worstContrast(rgb, loLum, hiLum) >= target;
	const [, C0, h] = rgbToOklch(hue);
	// 0.1833 is white's break-even above: below it, white is the only way out.
	const paperIsLight = (loLum + hiLum) / 2 > 0.1833;

	// Walk lightness away from the backdrop keeping the hue, and only surrender
	// chroma if that hue cannot reach the lightness it needs while in gamut.
	for (const chroma of [C0, C0 * 0.66, C0 * 0.33, 0]) {
		let lo = paperIsLight ? 0 : 0.5;
		let hi = paperIsLight ? 0.5 : 1;
		let best: RGB | null = null;
		for (let i = 0; i < 24; i++) {
			const L = (lo + hi) / 2;
			const rgb = oklchToRgb(clampChroma([L, chroma, h]));
			if (ok(rgb)) {
				best = rgb;
				// Passing isn't the goal — passing gently is. Creep back toward the
				// paper for the least aggressive ink that still holds, so the room
				// keeps its mood instead of snapping to black.
				if (paperIsLight) lo = L;
				else hi = L;
			} else if (paperIsLight) hi = L;
			else lo = L;
		}
		if (best) return { rgb: best, chromaKept: C0 === 0 ? 0 : chroma / C0 };
	}
	// Unreachable by the proof above. A promise still needs a floor, not a hope.
	return { rgb: paperIsLight ? [0, 0, 0] : [255, 255, 255], chromaKept: 0, fallback: true };
}

export interface Cluster {
	rgb: RGB;
	weight: number;
}

/**
 * The photograph's dominant colours, by coarse histogram rather than k-means.
 * Cheaper, steadier on photos, and — the reason it matters here — deterministic:
 * no seed, so the same picture always makes the same room.
 */
export function sampleClusters(pixels: Uint8ClampedArray, bins = 32, top = 6): Cluster[] {
	const hist = new Map<number, { n: number; r: number; g: number; b: number }>();
	for (let i = 0; i < pixels.length; i += 4) {
		if (pixels[i + 3] < 128) continue;
		const [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]];
		const key = ((r * bins) >> 8) * bins * bins + ((g * bins) >> 8) * bins + ((b * bins) >> 8);
		let e = hist.get(key);
		if (!e) hist.set(key, (e = { n: 0, r: 0, g: 0, b: 0 }));
		e.n++;
		e.r += r;
		e.g += g;
		e.b += b;
	}
	const total = [...hist.values()].reduce((a, e) => a + e.n, 0) || 1;
	return [...hist.values()]
		.sort((a, b) => b.n - a.n)
		.slice(0, top)
		.map((e) => ({
			rgb: [Math.round(e.r / e.n), Math.round(e.g / e.n), Math.round(e.b / e.n)] as RGB,
			weight: e.n / total
		}));
}

export interface Room {
	paper: RGB;
	ink: RGB;
	clusters: Cluster[];
}

/**
 * A room from a photograph. The paper keeps the picture's hue but is pushed to a
 * lightness a page can actually hold; the ink is the photo's own opposing mass,
 * resolved against that paper. A dark photograph flips the room's polarity by
 * itself, which is the whole pleasure of it.
 */
export function derive(pixels: Uint8ClampedArray, target = AA): Room {
	const clusters = sampleClusters(pixels);
	const dominant = clusters[0] ?? { rgb: [128, 128, 128] as RGB, weight: 1 };
	const [L, C, h] = rgbToOklch(dominant.rgb);
	const dark = L < 0.5;
	const paper = oklchToRgb(
		clampChroma([dark ? Math.min(L, 0.22) : Math.max(L, 0.9), Math.min(C, dark ? 0.04 : 0.03), h])
	);
	// The hue for the ink is whichever mass in the photo is furthest from the
	// paper in lightness — its own darks if the paper is light, and vice versa.
	const hue = clusters
		.slice()
		.sort((a, b) => Math.abs(luminance(b.rgb) - luminance(paper)) - Math.abs(luminance(a.rgb) - luminance(paper)))[0];
	return { paper, ink: inkFor(paper, hue?.rgb ?? [0, 0, 0], target).rgb, clusters };
}

export interface Wash {
	/** The ink for the room WITH this much photograph behind it. */
	ink: RGB;
	/** How much photograph the words can take. Derived; never chosen. */
	opacity: number;
}

/**
 * The ink and the wash, solved together.
 *
 * The order matters and getting it wrong is silent. Solve the ink against the
 * bare paper first and you get a correct ink with no margin — the solver returns
 * the GENTLEST ink that passes, landing on 4.500:1 exactly — so the first drop of
 * photograph eats the whole allowance and the wash caps near 1%. It looks like
 * the guarantee protecting the writer. It's the ordering being wrong: a flat
 * photograph of the paper's own colour should be allowed at full strength, and
 * that arrangement gives it 0.011.
 *
 * So ask the question the other way round. For a given amount of photograph:
 * does ANY legible ink exist against that composite? Then take the most
 * photograph that still answers yes, and use the ink it answered with — which is
 * free to be bolder than the gentle one, because it has a picture to beat rather
 * than a flat page.
 *
 * Terminates with an answer every time: at zero opacity the composite is just
 * the paper, where an ink always exists (see `inkFor`). Floors rather than
 * rounds, because this bounds a guarantee.
 */
export function washFor(paper: RGB, hue: RGB, imgLo: RGB, imgHi: RGB, target = AA): Wash {
	const mix = (a: RGB, b: RGB, t: number) => a.map((v, i) => v * (1 - t) + b[i] * t) as RGB;
	const rangeAt = (a: number): [number, number] => {
		const l1 = luminance(mix(paper, imgLo, a));
		const l2 = luminance(mix(paper, imgHi, a));
		return [Math.min(l1, l2), Math.max(l1, l2)];
	};
	const solve = (a: number): RGB | null => {
		const range = rangeAt(a);
		const ink = inkFor(paper, hue, target, range);
		return worstContrast(ink.rgb, range[0], range[1]) >= target ? ink.rgb : null;
	};
	let best = solve(0) ?? inkFor(paper, hue, target).rgb;
	let lo = 0;
	let hi = 1;
	for (let i = 0; i < 18; i++) {
		const a = (lo + hi) / 2;
		const ink = solve(a);
		if (ink) {
			lo = a;
			best = ink;
		} else hi = a;
	}
	return { ink: best, opacity: Math.floor(lo * 1000) / 1000 };
}

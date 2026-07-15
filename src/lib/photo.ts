/**
 * A photograph becomes a room.
 *
 * Nothing leaves the page here and nothing can: the picture is decoded, sampled
 * and re-encoded entirely in this tab. That is not a promise, it's the CSP —
 * connect-src is 'self', so there is nowhere to send it even by accident.
 *
 * The one thing to know before editing: `img-src` is `'self' data:`, so a
 * blob: URL from URL.createObjectURL is REFUSED by the browser. Verified against
 * the deployed policy. Everything here goes to a data: URI or not at all.
 */
import { derive, luminance, type RGB } from './palette';

/** Long edge after downscaling. Big enough to sample and to wash behind text,
 *  small enough that the writer's storage is not our landfill. */
const LONG_EDGE = 1200;
/** What a room's picture may cost. Past this we re-encode harder or give up. */
const MAX_BYTES = 400_000;

export interface DerivedRoom {
	paper: string;
	hue: string;
	photo: string;
}

const hex = ([r, g, b]: RGB) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

async function toBitmap(file: File): Promise<ImageBitmap | null> {
	try {
		// createImageBitmap(File) mints no URL at all, so it never touches img-src.
		return await createImageBitmap(file);
	} catch {
		return null;
	}
}

function draw(bmp: ImageBitmap, longEdge: number) {
	const scale = Math.min(1, longEdge / Math.max(bmp.width, bmp.height));
	const w = Math.max(1, Math.round(bmp.width * scale));
	const h = Math.max(1, Math.round(bmp.height * scale));
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	if (!ctx) return null;
	ctx.drawImage(bmp, 0, 0, w, h);
	return { canvas, ctx, w, h };
}

/**
 * Read a dropped file into a room: a paper and a hue solved from its own
 * colours, plus the picture itself, downscaled and re-encoded.
 *
 * Returns null rather than throwing on anything that isn't an image — a writer
 * who drags a PDF onto their draft should get nothing, not a stack trace.
 */
export async function readPhoto(file: File): Promise<DerivedRoom | null> {
	if (!file.type.startsWith('image/')) return null;
	const bmp = await toBitmap(file);
	if (!bmp) return null;
	try {
		const big = draw(bmp, LONG_EDGE);
		if (!big) return null;
		// Sample small: the room comes from the picture's masses, and a 96px
		// thumbnail has the same masses as the full frame at a fraction of the
		// work. Deterministic either way — the sampler is a histogram.
		const small = draw(bmp, 96);
		if (!small) return null;
		const room = derive(small.ctx.getImageData(0, 0, small.w, small.h).data);

		let photo = big.canvas.toDataURL('image/jpeg', 0.82);
		// Re-encode harder rather than store a photograph the size of a draft.
		for (const q of [0.7, 0.55, 0.4]) {
			if (photo.length <= MAX_BYTES) break;
			photo = big.canvas.toDataURL('image/jpeg', q);
		}
		if (photo.length > MAX_BYTES) return null;
		return { paper: hex(room.paper), hue: hex(room.ink), photo };
	} finally {
		bmp.close();
	}
}

/**
 * The darkest and lightest the washed picture actually gets, which is what the
 * ink has to survive. Blurred first, because the wash is blurred: blur pulls the
 * extremes in, and measuring the sharp picture would starve the wash of opacity
 * it could safely have had.
 */
export async function photoExtremes(dataUrl: string): Promise<[RGB, RGB] | null> {
	const img = new Image();
	img.src = dataUrl;
	try {
		await img.decode();
	} catch {
		return null;
	}
	// Downscaling IS a blur, and a cheap one: a 24px-wide average of the frame
	// approximates the 22px CSS blur closely enough to bound it.
	const bmp = await createImageBitmap(img);
	try {
		const small = draw(bmp, 24);
		if (!small) return null;
		const px = small.ctx.getImageData(0, 0, small.w, small.h).data;
		let lo: RGB = [255, 255, 255];
		let hi: RGB = [0, 0, 0];
		let loL = Infinity;
		let hiL = -Infinity;
		for (let i = 0; i < px.length; i += 4) {
			const c: RGB = [px[i], px[i + 1], px[i + 2]];
			const L = luminance(c);
			if (L < loL) [loL, lo] = [L, c];
			if (L > hiL) [hiL, hi] = [L, c];
		}
		return [lo, hi];
	} finally {
		bmp.close();
	}
}

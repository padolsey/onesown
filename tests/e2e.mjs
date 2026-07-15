/**
 * Real-browser E2E for the app. Drives Chromium (playwright-core) against a
 * RUNNING dev server — start `pnpm dev` first, then `pnpm test:e2e`.
 *
 * Env: ONESOWN_E2E_BASE (default http://localhost:5173),
 *      ONESOWN_E2E_CHROMIUM (path to a chromium binary; defaults to the newest
 *      chrome-headless-shell under ~/.cache/ms-playwright).
 */
import { chromium } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const BASE = process.env.ONESOWN_E2E_BASE || 'http://localhost:5173';
const SHOTS = path.join(os.tmpdir(), 'onesown-e2e-shots');
fs.mkdirSync(SHOTS, { recursive: true });

function findChromium() {
	if (process.env.ONESOWN_E2E_CHROMIUM) return process.env.ONESOWN_E2E_CHROMIUM;
	const cache = path.join(os.homedir(), '.cache', 'ms-playwright');
	const dirs = fs.existsSync(cache)
		? fs.readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell-')).sort()
		: [];
	for (const d of dirs.reverse()) {
		const p = path.join(cache, d, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
		if (fs.existsSync(p)) return p;
	}
	return chromium.executablePath();
}

const results = [];
function check(name, ok, detail = '') {
	results.push({ name, ok, detail });
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}
/**
 * An expected failure: something known-broken, recorded so its blast radius can't
 * widen quietly. Counted apart from real passes — a known limitation folded into
 * a pass total reads as working software.
 */
function known(name, stillBroken, detail = '') {
	results.push({ name, ok: stillBroken, detail, known: true });
	console.log(`${stillBroken ? 'KNOWN' : 'FAIL '}  ${name}${detail ? ' — ' + detail : ''}`);
}

const browser = await chromium.launch({ executablePath: findChromium() });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
// Privacy regression guard: the app must never talk to another origin.
//
// Listen on the CONTEXT, not the page: Chromium reports service-worker-initiated
// requests against the BrowserContext, and the worker is the one JS context on
// the origin the page's meta CSP cannot govern. page.on('request') never sees
// them, which is exactly where a leak would be invisible.
const crossOrigin = [];
const sameOrigin = (url) => {
	try {
		return new URL(url).origin === new URL(BASE).origin;
	} catch {
		return false;
	}
};
ctx.on('request', (r) => {
	const url = r.url();
	if (/^https?:/.test(url) && !sameOrigin(url)) crossOrigin.push(url);
});
// WebSockets are not reported as requests by either listener, so they need their
// own. Compare origins rather than prefixing BASE — the dev server's HMR socket
// is same-origin on a different scheme and must not read as a leak.
page.on('websocket', (ws) => {
	if (!sameOrigin(ws.url().replace(/^ws/, 'http'))) crossOrigin.push(ws.url());
});

const tab = (name) => page.locator('button.room-tab').filter({ hasText: new RegExp('^' + name + '$') });
const textarea = () => page.locator('textarea');
const rich = () => page.locator('.rich');
const hidePicker = () =>
	page.evaluate(() => {
		Object.defineProperty(window, 'showSaveFilePicker', { value: undefined });
	});
/** Read the canonical draft instantly via the Term textarea (no debounce wait). */
async function canonical() {
	await tab('Term').click();
	return await textarea().inputValue();
}

// ── 1. Load: default room, standalone identity ──────────────────────────────
await page.goto(BASE + '/', { waitUntil: 'networkidle' });
check('title', (await page.title()).includes('Room of One'));
check('bare active by default', (await tab('Bare').getAttribute('aria-pressed')) === 'true');
check('no focus steal on load', await page.evaluate(() => document.activeElement?.tagName !== 'TEXTAREA'));
check('app-name meta', await page.evaluate(() =>
	(document.querySelector('meta[name="application-name"]')?.getAttribute('content') ?? '').includes('Room of One')));

// ── 2. Persistence + shell switching ─────────────────────────────────────────
const TEXT = 'Dear reader,\n\nThe room changes the writing. Five words prove nothing, but here we are.';
await textarea().click();
await textarea().fill(TEXT);
await page.waitForTimeout(900);
const stored1 = await page.evaluate(() => JSON.parse(localStorage.getItem('onesown:v1') || 'null'));
check('draft persisted to localStorage', stored1 && stored1.text === TEXT);
check('shell persisted', stored1 && stored1.shell === 'bare');

await textarea().evaluate((el) => { el.setSelectionRange(12, 12); el.focus(); });
await tab('Term').click();
await page.waitForTimeout(200);
check('draft survives shell switch', (await textarea().inputValue()) === TEXT);
const focusInfo = await page.evaluate(() => {
	const el = document.activeElement;
	return el && el.tagName === 'TEXTAREA' ? { focused: true, sel: el.selectionStart } : { focused: false };
});
check('editor focused after switch', focusInfo.focused === true);
check('cursor position restored', focusInfo.sel === 12, `sel=${focusInfo.sel}`);
const words = TEXT.trim().split(/\s+/).length;
check('term status shows word count', (await page.locator('footer', { hasText: 'INSERT' }).textContent()).includes(`${words}w`));

await tab('Post').click();
check('post counter', (await page.locator('section span.tabular-nums').textContent()).trim() === String(280 - TEXT.length));
await page.waitForTimeout(900);
await page.reload({ waitUntil: 'networkidle' });
check('draft restored after reload', (await textarea().inputValue()) === TEXT);
check('shell restored after reload', (await tab('Post').getAttribute('aria-pressed')) === 'true');

// ── 3. Scratch Ln/Col + Ctrl+S download fallback ─────────────────────────────
await tab('Scratch').click();
await textarea().evaluate((el) => { el.focus(); el.setSelectionRange(17, 17); el.dispatchEvent(new Event('click')); });
await page.waitForTimeout(100);
check('scratch Ln/Col', (await page.locator('footer span', { hasText: 'Ln' }).textContent()).trim() === 'Ln 3, Col 4');

await hidePicker();
const dl1 = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
await textarea().press('Control+s');
const d1 = await dl1;
check('Ctrl+S triggers download fallback', !!d1, d1 ? d1.suggestedFilename() : 'no download');
if (d1) check('download filename from first line', d1.suggestedFilename() === 'dear-reader.txt', d1.suggestedFilename());

// ── 4. Clear flow ────────────────────────────────────────────────────────────
page.once('dialog', (d) => d.accept());
await page.getByRole('button', { name: 'Clear', exact: true }).click();
await page.waitForTimeout(200);
check('clear empties editor', (await textarea().inputValue()) === '');
const stored2 = await page.evaluate(() => JSON.parse(localStorage.getItem('onesown:v1') || 'null'));
check('clear persisted', stored2 && stored2.text === '');

// ── 5. Functional chrome: Doc bolding round-trip ─────────────────────────────
await textarea().fill('Make me bold today.');
await tab('Doc').click();
check('doc renders rich editor', (await rich().count()) === 1);
await rich().click();
await page.keyboard.press('Control+a');
await page.locator('button[title="Bold (Ctrl+B)"]').click();
await page.waitForTimeout(200);
check('doc B button bolds selection', (await rich().locator('b').count()) >= 1, await rich().innerHTML());
check('B button shows pressed state', (await page.locator('button[title="Bold (Ctrl+B)"]').getAttribute('aria-pressed')) === 'true');
check('bold serialized to markers', (await canonical()) === '**Make me bold today.**');
await tab('Doc').click();
await page.waitForTimeout(200);
check('markers re-render as bold on return', (await rich().locator('b').count()) >= 1);

// ── 6. Enter key: paragraphs must not inflate (Chromium makes <div> blocks) ──
await tab('Term').click();
await textarea().fill('abc');
await tab('Doc').click();
await rich().click();
await page.keyboard.press('Control+End');
await page.keyboard.press('Enter');
await page.keyboard.type('def');
check('enter makes exactly one newline', (await canonical()) === 'abc\ndef', JSON.stringify(await textarea().inputValue()));
await textarea().fill('p1');
await tab('Doc').click();
await rich().click();
await page.keyboard.press('Control+End');
await page.keyboard.press('Enter');
await page.keyboard.press('Enter');
await page.keyboard.type('p2');
check('blank line between paragraphs round-trips', (await canonical()) === 'p1\n\np2', JSON.stringify(await textarea().inputValue()));

// ── 7. Literal asterisks inside formatting survive via escaping ─────────────
await textarea().fill('');
await tab('Doc').click();
await rich().click();
await page.locator('button[title="Italic (Ctrl+I)"]').click();
await page.keyboard.type('2*3 = 6');
check('literal * inside italic escapes', (await canonical()) === '*2\\*3 = 6*', JSON.stringify(await textarea().inputValue()));
await tab('Doc').click();
await page.waitForTimeout(200);
check('escaped * renders back inside italic', (await rich().locator('i').textContent()) === '2*3 = 6');

// ── 8. Idempotence sweep: hostile drafts must stabilize after one pass ──────
const CORPUS = [
	'**a*b****c*',
	'2\\*3 = 6',
	'a * b * c',
	'*unclosed',
	'trailing**',
	'<u>unclosed u',
	'para1\n\npara2',
	'ends with newline\n',
	'***both***',
	'plain <b>not html</b> & ampersand',
	// A backslash ending a formatted run: the escape and the closing marker land
	// against each other, so the marker must not be read as escaped. These drifted
	// further on every pass before the guard in domToMarkers' wrap (`**C:\\**` ->
	// `**C:\**` -> `**C:**`, losing the bold and then the backslash).
	'**C:\\\\**',
	'*a\\\\*',
	'<u>a\\\\</u>',
	'**a\\\\\\\\**',
	'plain\\ backslash'
];
async function richTouch() {
	await tab('Doc').click();
	await rich().click();
	await page.keyboard.press('Control+End');
	await page.keyboard.type('x');
	await page.keyboard.press('Backspace');
	await page.waitForTimeout(100);
}
const STABLE_EXACT = new Set([
	'a * b * c',
	'para1\n\npara2',
	'ends with newline\n',
	'**C:\\\\**',
	'*a\\\\*',
	'<u>a\\\\</u>',
	'**a\\\\\\\\**',
	'plain\\ backslash'
]);
for (const s of CORPUS) {
	await tab('Term').click();
	await textarea().fill(s);
	await richTouch();
	const p1 = await canonical();
	await richTouch();
	const p2 = await canonical();
	const name = JSON.stringify(s.length > 24 ? s.slice(0, 24) + '…' : s);
	check(`idempotent: ${name}`, p2 === p1, p2 === p1 ? '' : `p1=${JSON.stringify(p1)} p2=${JSON.stringify(p2)}`);
	if (STABLE_EXACT.has(s)) check(`untouched: ${name}`, p1 === s, JSON.stringify(p1));
}

// ── 9. Mail: Ctrl+I works; the scenery is scenery ────────────────────────────
await tab('Term').click();
await textarea().fill('emphasis test');
await tab('Mail').click();
await rich().click();
await page.keyboard.press('Control+a');
await page.keyboard.press('Control+i');
await page.waitForTimeout(300);
check('mail Ctrl+I italicizes', (await rich().locator('i, em').count()) >= 1, await rich().innerHTML());
// The compose furniture must stay furniture: nothing in it may take a keystroke,
// take focus, or claim an action. The addressing rows and the Send button used to
// do all three — Send needed a footer explaining that it didn't send, and the
// fields swallowed typing into state no other room saw and no saved file carried.
check(
	'mail has no field to type into',
	(await page.locator('section input, section [contenteditable="true"]:not(.rich)').count()) === 0,
	'an addressing row that accepts typing is a promise the app does not keep'
);
check(
	'mail offers no action but the editor and B/I/U',
	(await page.locator('section button:not([title^="Bold"]):not([title^="Italic"]):not([title^="Underline"])').count()) === 0,
	'every button in Mail should be a real formatting control'
);

// ── 10. Scratch menus all function ───────────────────────────────────────────
await tab('Scratch').click();
const menuBtn = (name) => page.locator('nav button').filter({ hasText: new RegExp('^' + name + '$') });
await menuBtn('Format').click();
await page.getByRole('menuitem', { name: /Word Wrap/ }).click();
check('word wrap off → pre', (await textarea().evaluate((el) => getComputedStyle(el).whiteSpace)) === 'pre');
await menuBtn('Format').click();
await page.getByRole('menuitem', { name: /Word Wrap/ }).click();
check('word wrap back on → pre-wrap', (await textarea().evaluate((el) => getComputedStyle(el).whiteSpace)) === 'pre-wrap');
await menuBtn('View').click();
await page.getByRole('menuitem', { name: /Status Bar/ }).click();
check('status bar hidden', (await page.locator('footer', { hasText: 'Ln' }).count()) === 0);
await menuBtn('View').click();
await page.getByRole('menuitem', { name: /Status Bar/ }).click();
check('status bar restored', (await page.locator('footer', { hasText: 'Ln' }).count()) === 1);
await menuBtn('Edit').click();
await page.getByRole('menuitem', { name: 'Select All' }).click();
check('edit > select all selects text', (await textarea().evaluate((el) => el.selectionEnd - el.selectionStart)) > 0);
await menuBtn('Help').click();
await page.getByRole('menuitem', { name: 'About Scratchpad' }).click();
check('about dialog opens', (await page.getByRole('dialog', { name: 'About Scratchpad' }).count()) === 1);
check('about dialog takes focus', await page.evaluate(() => document.activeElement?.getAttribute('role') === 'dialog'));
await page.keyboard.press('Escape');
check('escape closes about', (await page.getByRole('dialog', { name: 'About Scratchpad' }).count()) === 0);
check('focus returns to Help menu', await page.evaluate(() => document.activeElement?.textContent?.trim() === 'Help'));
await hidePicker();
const dl2 = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
await menuBtn('File').click();
await page.getByRole('menuitem', { name: 'Save…' }).click();
check('file > save triggers save', !!(await dl2));

// ── 11. Screenshots ──────────────────────────────────────────────────────────
await tab('Term').click();
await textarea().fill('The room is **not** neutral.\n\nEvery surface asks for a *different* voice.');
for (const shell of ['Bare', 'Scratch', 'Pad', 'Term', 'Mail', 'Doc', 'Post', 'Yours']) {
	await tab(shell).click();
	await page.waitForTimeout(250);
	await page.screenshot({ path: path.join(SHOTS, `${shell.toLowerCase()}.png`) });
}
// (the pageErrors assertion lives with the terminal guards at the foot of this
// file — it had drifted to here, leaving every later section unchecked)

// ── 12. Verification surface ─────────────────────────────────────────────────
check('footer links to /verify', (await page.locator('a[href="/verify"]').count()) === 1);
await page.goto(BASE + '/verify', { waitUntil: 'networkidle' });
const shownCommit = ((await page.locator('[data-commit]').textContent()) ?? '').trim();
check('verify page shows full commit', /^[0-9a-f]{40}$/.test(shownCommit), shownCommit);
const attestation = await page.evaluate(async () => {
	const r = await fetch('/.well-known/deployment.json').catch(() => null);
	return r && r.ok ? await r.json() : null;
});
if (attestation) {
	check('attestation commit matches page', attestation.commit === shownCommit,
		`att=${attestation.commit?.slice(0, 7)} page=${shownCommit.slice(0, 7)}`);
	check('attestation names public repo', String(attestation.repository).includes('github.com/padolsey/onesown'));
	check('verify page confirms match', (await page.locator('.v-facts').textContent()).includes('matches this page ✓'));
} else {
	console.log('SKIP  attestation checks (deployment.json not served — dev build)');
}
const isDeployed = !/localhost|127\.0\.0\.1/.test(BASE);
if (isDeployed) {
	const res = await page.request.get(BASE + '/');
	const h = res.headers();
	check('security headers served', h['x-content-type-options'] === 'nosniff' &&
		(h['content-security-policy'] || '').includes("frame-ancestors 'none'"), JSON.stringify(h['content-security-policy'] ?? null));
	check('csp meta present', (await page.locator('meta[http-equiv="content-security-policy" i]').count()) >= 1);
	check('manifest served', (await page.request.get(BASE + '/manifest.webmanifest')).ok());
	const swRegistered = await page.evaluate(async () => {
		for (let i = 0; i < 20; i++) {
			if (await navigator.serviceWorker?.getRegistration()) return true;
			await new Promise((r) => setTimeout(r, 250));
		}
		return false;
	});
	check('service worker registers', swRegistered);
}

// ── 13. Preferences: focus mode, theme, variants, Yours room ────────────────
await page.goto(BASE + '/', { waitUntil: 'networkidle' });
check('yours tab present', (await tab('Yours').count()) === 1);

await page.getByRole('button', { name: 'Focus', exact: true }).click();
check('focus hides chrome', (await page.locator('header.room-top').count()) === 0 &&
	(await page.locator('footer.room-foot').count()) === 0);
await page.keyboard.press('Escape');
await page.waitForTimeout(100);
check('escape exits focus', (await page.locator('header.room-top').count()) === 1);

const prefsBtn = () => page.locator('summary[aria-label="Preferences"]');
await prefsBtn().click();
await page.locator('label', { hasText: 'dark' }).locator('input').check();
const darkBg = await page.evaluate(() => getComputedStyle(document.querySelector('.room-app')).backgroundColor);
check('dark theme override applies', darkBg === 'rgb(25, 24, 23)', darkBg);
// The override has to reach the root, not just the app box: color-scheme is what
// the scrollbars, the overscroll gutter and every native control actually read.
// Chromium runs light by default here, so this is the override fighting the OS.
const root = await page.evaluate(() => ({
	bg: getComputedStyle(document.documentElement).backgroundColor,
	scheme: getComputedStyle(document.documentElement).colorScheme
}));
check('dark theme override reaches the document root', root.bg === 'rgb(25, 24, 23)' && root.scheme === 'dark', JSON.stringify(root));
// /verify is reached from a themed page's footer, so it must arrive themed.
await page.locator('a[href="/verify"]').click();
await page.waitForTimeout(400);
const vBg = await page.evaluate(() => getComputedStyle(document.querySelector('.v-app')).backgroundColor);
check('theme override carries to /verify', vBg === 'rgb(25, 24, 23)', vBg);
await page.goBack();
await page.waitForTimeout(400);
await prefsBtn().click();
await page.locator('label', { hasText: 'system' }).locator('input').check();
const sysScheme = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
check('system theme releases the root back to the OS', sysScheme === 'light dark', sysScheme);
await prefsBtn().click();

// The active room tab inverts its text to the topbar's own colour, so a
// currentColor focus ring would be painted in the surface it sits on — and it is
// the first thing Tab reaches. Must be a real keypress: .focus() won't set
// :focus-visible. Settle first — Tailwind's transition-colors animates
// outline-color, so an immediate read catches the ring mid-fade.
await page.locator('button.room-tab[aria-pressed="true"]').focus();
await page.keyboard.press('Shift+Tab');
await page.keyboard.press('Tab');
await page.waitForTimeout(400);
const ring = await page.evaluate(() => {
	const el = document.activeElement;
	if (!el?.classList.contains('room-tab')) return { bad: 'tab did not land on a room tab' };
	const toRGB = (css) => {
		const c = document.createElement('canvas').getContext('2d');
		c.fillStyle = '#000';
		c.fillStyle = css;
		c.fillRect(0, 0, 1, 1);
		const d = c.getImageData(0, 0, 1, 1).data;
		return [d[0], d[1], d[2]];
	};
	const lum = ([r, g, b]) => {
		const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
		return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
	};
	const cs = getComputedStyle(el);
	// The ring is drawn outside the border box, onto the topbar's surface.
	const behind = getComputedStyle(document.querySelector('.room-app')).backgroundColor;
	const [a, b] = [lum(toRGB(cs.outlineColor)), lum(toRGB(behind))].sort((x, y) => y - x);
	return { visible: el.matches(':focus-visible'), ratio: +((a + 0.05) / (b + 0.05)).toFixed(2) };
});
check(
	'focus ring on the active room tab is visible',
	ring.visible && ring.ratio >= 3,
	JSON.stringify(ring) + ' (WCAG 1.4.11 needs 3:1)'
);

await tab('Post').click();
await prefsBtn().click();
await page.locator('label', { hasText: '500' }).locator('input').check();
await textarea().fill('limit check');
check('post limit variant', (await page.locator('section span.tabular-nums').textContent()).trim() === String(500 - 'limit check'.length));
await page.locator('label', { hasText: '280' }).locator('input').check();
await prefsBtn().click();

await tab('Yours').click();
await page.locator('label', { hasText: 'Paper' }).locator('select').selectOption('night');
await page.waitForTimeout(700);
await page.reload({ waitUntil: 'networkidle' });
check('yours room persists customization', await page.evaluate(() => {
	const p = JSON.parse(localStorage.getItem('onesown:prefs:v1') || '{}');
	return p.yours?.paper === 'night';
}));
check('yours room renders custom paper', await page.evaluate(() =>
	getComputedStyle(document.querySelector('main section')).backgroundColor === 'rgb(15, 15, 17)'));
await page.locator('label', { hasText: 'Paper' }).locator('select').selectOption('cream');

// ── 14. Undo: the draft's history must outlive the room showing it ──────────
await page.goto(BASE + '/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.removeItem('onesown:v1'));
await page.reload({ waitUntil: 'networkidle' });
await textarea().click();
await page.keyboard.type('first thought');
await page.waitForTimeout(700); // let the coalescing window close
await page.keyboard.type(' and a second');
await page.waitForTimeout(700);
await tab('Pad').click(); // a textarea's native undo stack dies here
await page.waitForTimeout(250);
await page.keyboard.press('Control+z');
await page.waitForTimeout(250);
check('undo survives a room switch', (await textarea().inputValue()) === 'first thought');
await page.keyboard.press('Control+Shift+z');
await page.waitForTimeout(250);
check('redo survives a room switch', (await textarea().inputValue()) === 'first thought and a second');

// Clear is the one destructive act; touch has no ⌘Z, so the way back is visible.
page.once('dialog', (d) => d.accept());
await page.getByRole('button', { name: 'Clear', exact: true }).click();
await page.waitForTimeout(300);
check('clear offers a visible undo', (await page.locator('button.room-undo').count()) === 1);
await page.locator('button.room-undo').click();
await page.waitForTimeout(300);
check('undo clear restores the draft', (await textarea().inputValue()) === 'first thought and a second');

// Clear focuses the editor, so typing straight after it is the designed path —
// not an edge case. The offer must still mean what its label says: it restores
// the cleared draft, and is not a synonym for "undo the last thing I did".
page.once('dialog', (d) => d.accept());
await page.getByRole('button', { name: 'Clear', exact: true }).click();
await page.waitForTimeout(300);
await page.keyboard.type('a false start');
await page.waitForTimeout(300);
check('undo clear survives typing after the clear', (await page.locator('button.room-undo').count()) === 1);
await page.locator('button.room-undo').click();
await page.waitForTimeout(300);
check(
	'undo clear restores the draft, not the typing',
	(await textarea().inputValue()) === 'first thought and a second',
	JSON.stringify(await textarea().inputValue())
);
// Restoring is an ordinary edit, so it can be walked back out of like any other.
await page.keyboard.press('Control+z');
await page.waitForTimeout(250);
check('undo after restore steps back', (await textarea().inputValue()) === 'a false start', JSON.stringify(await textarea().inputValue()));

// ── 15. Marker shortcuts: on where the room is a writing surface ────────────
await textarea().click();
await page.keyboard.press('Control+a');
await page.keyboard.press('Delete');
await page.keyboard.type('make me bold');
await page.keyboard.down('Shift');
for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft');
await page.keyboard.up('Shift');
await page.keyboard.press('Control+b');
await page.waitForTimeout(250);
check('ctrl+B types markers in Pad', (await textarea().inputValue()) === 'make me **bold**');
await page.keyboard.press('Control+i');
await page.waitForTimeout(250);
check('ctrl+I nests rather than dismantling bold', (await textarea().inputValue()) === 'make me ***bold***');
// Each mark peels off independently, leaving the other intact.
await page.keyboard.press('Control+i');
await page.waitForTimeout(250);
check('ctrl+I peels italic off, bold survives', (await textarea().inputValue()) === 'make me **bold**');
await page.keyboard.press('Control+b');
await page.waitForTimeout(250);
check('markers toggle back off', (await textarea().inputValue()) === 'make me bold');

// Term is a terminal: typing your own asterisks is the idiom, so no shortcut.
await tab('Term').click();
await page.waitForTimeout(250);
await textarea().click();
await page.keyboard.press('Control+a');
await page.keyboard.press('Delete');
await page.keyboard.type('plain');
await page.keyboard.down('Shift');
for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft');
await page.keyboard.up('Shift');
await page.keyboard.press('Control+b');
await page.waitForTimeout(250);
check('term leaves ctrl+B alone', (await textarea().inputValue()) === 'plain');

// ── 16. Focus mode takes the whole screen, and leaves it cleanly ────────────
await page.goto(BASE + '/', { waitUntil: 'networkidle' });
await page.keyboard.press('Control+.');
await page.waitForTimeout(400);
check('focus enters fullscreen', await page.evaluate(() => !!document.fullscreenElement));
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
check('escape leaves fullscreen', await page.evaluate(() => !document.fullscreenElement));
// Leaving fullscreen by any other route must not strand the writer in focus mode.
await page.keyboard.press('Control+.');
await page.waitForTimeout(400);
await page.evaluate(() => document.exitFullscreen());
await page.waitForTimeout(400);
check('external fullscreen exit restores chrome', (await page.locator('header.room-top').count()) === 1);

// ── 17. The draft is one string shared by every tab, and a stale tab must not win ──
// A real setItem in a second page of this context fires a genuine cross-tab
// 'storage' event — no debounce race to lose.
const otherTab = await ctx.newPage();
await otherTab.goto(BASE + '/', { waitUntil: 'networkidle' });
const otherTabWrites = (t) =>
	otherTab.evaluate((text) => {
		localStorage.setItem(
			'onesown:v1',
			JSON.stringify({ v: 1, text, shell: 'bare', mailTo: '', mailSubject: '', mailCc: '', mailBcc: '', savedAt: Date.now() })
		);
	}, t);
const storedText = () => page.evaluate(() => JSON.parse(localStorage.getItem('onesown:v1') ?? '{}').text ?? '');

await page.goto(BASE + '/', { waitUntil: 'networkidle' });
await textarea().click();
await page.keyboard.press('Control+a');
await page.keyboard.press('Delete');
await page.waitForTimeout(800); // let our own save settle, so this tab is idle
await otherTabWrites('written in the other tab');
await page.waitForTimeout(400);
check('an idle tab adopts a draft written elsewhere', (await textarea().inputValue()) === 'written in the other tab', JSON.stringify(await textarea().inputValue()));
// The original bug: a single room-tab click in a stale tab scheduled a save that
// flattened the newer draft. Switching rooms must not cost the other tab its words.
await tab('Pad').click();
await page.waitForTimeout(1200);
check('switching rooms in a stale tab does not clobber the shared draft', (await storedText()) === 'written in the other tab', JSON.stringify(await storedText()));

// A tab with unsaved edits has words worth keeping too — so hold both and say so.
await tab('Bare').click();
await page.waitForTimeout(400);
await textarea().click();
await page.keyboard.press('Control+a');
await page.keyboard.press('Delete');
await page.waitForTimeout(800);
await page.keyboard.type('my unsaved local edits');
await otherTabWrites('a whole chapter from the other tab'); // lands inside our 600ms debounce
await page.waitForTimeout(1500);
check('a tab with unsaved edits keeps its own text', (await textarea().inputValue()) === 'my unsaved local edits', JSON.stringify(await textarea().inputValue()));
check('a conflicted tab refuses to overwrite the other copy', (await storedText()) === 'a whole chapter from the other tab', JSON.stringify(await storedText()));
// The notice is the whole point of surfacing this: it must be reachable on a
// phone, where the topbar status is display:none.
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(200);
check('the conflict notice is visible on a phone', await page.locator('.room-notice').isVisible());
check('the topbar status stays hidden on a phone', !(await page.locator('.room-status').first().isVisible()));
// ...and in focus mode, where a writer can sit for a long stretch.
await page.keyboard.press('Control+.');
await page.waitForTimeout(400);
check('the notice survives focus mode', await page.locator('.room-notice').isVisible());
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await page.setViewportSize({ width: 1280, height: 900 });
// Resolving is deliberate and by hand — never silent.
await page.locator('.notice-action').click();
await page.waitForTimeout(700);
check('keeping this copy resumes saving', (await storedText()) === 'my unsaved local edits', JSON.stringify(await storedText()));
check('resolving dismisses the notice', (await page.locator('.room-notice').count()) === 0);
await otherTab.close();

// ── 18. Semantic round trip: does the draft still MEAN what was written? ─────
//
// The idempotence sweep above only asks whether the string stops changing. That
// is not the same question. `a*b<i>y</i>` serializes to `a*b*y*`, renders back
// as `a<i>b</i>y*` and re-serializes to `a*b*y*` — perfectly stable, and the
// italic has moved off "y" onto "b" while the plaintext changed. The sweep says
// OK. Measured, that blind spot covers ~2.4x more broken cases than the sweep
// detects at all, which is how the backslash bug shipped.
//
// So compare MEANING: the plaintext, plus the text each mark covers. Covered
// text rather than indices, so consumed delimiters (which shift every later
// index) don't produce false alarms, while a mark that moved or died still does.
//
// This drives the real Doc room, because the half the unit tests cannot reach is
// domToMarkers, and that needs a real contenteditable.
// Marks per POSITION, not per mark. Recording only the text each mark covers
// cannot tell "<b>go</b> go" from "go <b>go</b>" — both say bold covers "go" —
// so a mark that MOVED, the very thing this exists to catch, would compare equal.
// Offsets are into each side's own rendered plaintext, which is sound: if the
// plaintext differs the comparison has already failed on text; if it matches,
// the indices line up by construction.
const semantics = () =>
	rich().evaluate((root) => {
		let text = '';
		const marks = [];
		const MARK = { B: 'b', STRONG: 'b', I: 'i', EM: 'i', U: 'u' };
		const walk = (n, open) => {
			for (const c of n.childNodes) {
				if (c.nodeType === 3) {
					const here = [...new Set(open)].sort().join('') || '-';
					for (const ch of c.nodeValue ?? '') {
						text += ch;
						marks.push(here);
					}
				} else if (c.nodeName === 'BR') {
					text += '\n';
					marks.push('-');
				} else if (c.nodeType === 1) {
					const m = MARK[c.nodeName];
					walk(c, m ? [...open, m] : open);
				}
			}
		};
		walk(root, []);
		if (text.endsWith('\n')) {
			text = text.slice(0, -1); // trailing caret placeholder is not content
			marks.pop();
		}
		return { text, marks: marks.join('') };
	});
const sameSem = (a, b) => a.text === b.text && a.marks === b.marks;
/** Expected marks string: `mark` covering `word`, nothing else set. */
const marksFor = (text, mark, word) => {
	const at = text.indexOf(word);
	return Array.from(text, (_, i) => (i >= at && i < at + word.length ? mark : '-')).join('');
};

// The cases must start from what the WRITER BUILT, not from a canonical string:
// rendering a draft that is already mis-parsed and checking it stays mis-parsed
// measures stability again, and reports green. So drive the room — type the text,
// press B where the writer would — capture the intent, then force a canonical
// round trip and ask whether the intent survived.
// Type the whole line, then select a word and bold it — what a writer does, and
// deterministic. (Toggling B at a collapsed caret and typing into it does not
// survive serialize() re-entering the editor, which is its own question.)
const markBtn = (m) => page.locator(`button[title="${m} (Ctrl+${m[0]})"]`);
async function writeInDoc(text, boldWord) {
	await tab('Doc').click();
	await rich().click();
	await page.keyboard.press('Control+a');
	await page.keyboard.press('Delete');
	// Typing-state survives clearing, so without this the previous case leaks in:
	// the whole line types bold, and bolding the target word toggles it OFF. Both
	// sides of the comparison then agree, and the case reports faithful while
	// measuring the exact inverse of its name. Reset every mark, not just bold —
	// a leaked italic would do the same thing one level quieter.
	await page.waitForTimeout(100);
	for (const m of ['Bold', 'Italic', 'Underline']) {
		if ((await markBtn(m).getAttribute('aria-pressed')) === 'true') {
			await markBtn(m).click();
			await page.waitForTimeout(80);
		}
	}
	await page.keyboard.type(text);
	await page.waitForTimeout(150);
	await rich().evaluate((root, sub) => {
		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
		let node;
		while ((node = walker.nextNode())) {
			const at = (node.nodeValue ?? '').indexOf(sub);
			if (at === -1) continue;
			const r = document.createRange();
			r.setStart(node, at);
			r.setEnd(node, at + sub.length);
			const sel = getSelection();
			sel.removeAllRanges();
			sel.addRange(r);
			return;
		}
		throw new Error('could not select ' + JSON.stringify(sub));
	}, boldWord);
	await markBtn('Bold').click();
	await page.waitForTimeout(250);
}

// `faithful: false` records a KNOWN LIMITATION, measured and understood: a stray
// * (or trailing \) where a mark begins right after a NON-WHITESPACE character
// lets the parser re-pair asterisk runs across the marker boundary and destroy
// the mark. A space before the mark makes it unable to close, which is why
// ordinary prose is safe. It is a parser defect — CommonMark's "rule of 3"
// forbids exactly this mis-parse — but correcting it is not isolated (it repairs
// 511 of 1236 sweep cases while introducing 5, and needs serializer changes to
// reach zero). See tests/markers.test.ts and .claude/markers-investigation/.
//
// They are asserted so the blast radius cannot widen quietly. If one starts
// passing, someone fixed the codec: flip it to faithful:true, don't delete it.
const SEMANTIC_CASES = [
	{ name: 'bold after a space', text: '2*3 and bold', bold: 'bold', faithful: true },
	{ name: 'bold in plain prose', text: 'a normal sentence with bold in it', bold: 'bold', faithful: true },
	{ name: 'a backslash inside a bold run', text: 'path C:\\', bold: 'C:\\', faithful: true },
	{ name: 'bold, then a backslash after it', text: 'backup C:\\', bold: 'backup', faithful: true },
	{ name: 'KNOWN stray asterisk, bold after "("', text: '2*3 (six)', bold: 'six', faithful: false },
	{ name: 'KNOWN stray asterisk, bold after a quote', text: 'a*b "quoted"', bold: 'quoted', faithful: false },
	{ name: 'KNOWN backslash abutting a bold run', text: 'C:\\backup', bold: 'backup', faithful: false }
];
for (const c of SEMANTIC_CASES) {
	await writeInDoc(c.text, c.bold);
	const intent = await semantics(); // what the writer actually built
	// Verify the fixture before trusting the result. A round trip between two
	// identically-wrong states looks faithful, so a case that failed to set up is
	// worse than useless — it reports green. Compare the WHOLE structure, not just
	// the text and the bold: a leaked italic would otherwise sit on both sides and
	// pass this check while poisoning the comparison.
	const wantMarks = marksFor(c.text, 'b', c.bold);
	check(
		`fixture built as intended: ${c.name}`,
		intent.text === c.text && intent.marks === wantMarks,
		`wanted text ${JSON.stringify(c.text)} marks ${JSON.stringify(wantMarks)}, built ${JSON.stringify(intent)}`
	);
	await tab('Term').click(); // force the draft through the canonical string
	await page.waitForTimeout(150);
	await tab('Doc').click();
	await page.waitForTimeout(250);
	const survived = await semantics(); // ...and what came back
	const held = sameSem(intent, survived);
	const trace = `wrote ${JSON.stringify(intent)} · got back ${JSON.stringify(survived)}`;
	if (c.faithful) {
		check(`meaning survives a room switch: ${c.name}`, held, held ? '' : `REGRESSED — ${trace}`);
	} else {
		known(
			`meaning survives a room switch: ${c.name}`,
			!held,
			held ? `now FAITHFUL: the codec was fixed, flip this case to faithful:true — ${trace}` : trace
		);
		// A known limitation is licence for one specific wrong answer, not for any
		// wrong answer. Pinning the exact corruption would enshrine it, so pin a
		// floor instead: the words must still be there and the editor still usable.
		check(
			`known limitation stays bounded: ${c.name}`,
			survived.text.includes(c.bold) && survived.text.length > 0,
			`the writer's word ${JSON.stringify(c.bold)} must survive even when its mark does not — ${trace}`
		);
	}
}

// ── 19. Shortcuts follow the keycap, not the US-QWERTY position ─────────────
//
// A real keyboard sends both: `key` is the letter the layout produced, `code` is
// where that key sits on a US board. They only agree on QWERTY. Playwright's
// keyboard can't decouple them — it drives a virtual US layout — so these
// dispatch the pairs a real QWERTZ/Colemak/Dvorak/Cyrillic keyboard sends.
// The room is persisted, so a reload lands wherever the last section left off —
// Doc, which has no textarea. Ask for one.
await page.goto(BASE + '/', { waitUntil: 'networkidle' });
await tab('Bare').click();
await page.waitForTimeout(200);
const pressLayout = (key, code, opts = {}) =>
	page.evaluate(
		([k, c, o]) => {
			const e = new KeyboardEvent('keydown', { key: k, code: c, ctrlKey: true, bubbles: true, cancelable: true, ...o });
			(document.querySelector('textarea') ?? document.body).dispatchEvent(e);
			return e.defaultPrevented;
		},
		[key, code, opts]
	);

await textarea().click();
await page.keyboard.press('Control+a');
await page.keyboard.press('Delete');
await page.keyboard.type('first');
await page.waitForTimeout(700);
await page.keyboard.type(' second');
await page.waitForTimeout(700);
await page.keyboard.press('Control+z');
await page.waitForTimeout(250);
const undone = await textarea().inputValue();
check('setup: undo left something to redo', undone === 'first', JSON.stringify(undone));
// QWERTZ: Y and Z are swapped. Ctrl+Y arrives as key='y' on code='KeyZ', which
// the old handler matched to the Z branch and undid — the opposite of the ask.
await pressLayout('y', 'KeyZ');
await page.waitForTimeout(250);
check('QWERTZ Ctrl+Y redoes rather than undoing', (await textarea().inputValue()) === 'first second', JSON.stringify(await textarea().inputValue()));
// Dvorak's F sits on QWERTY's Y. Browser find must survive.
const stoleFind = await pressLayout('f', 'KeyY');
check('Dvorak Ctrl+F is left to the browser', stoleFind === false, 'the app called preventDefault on the find shortcut');
// Dvorak's R sits on QWERTY's O. Reload must survive.
const stoleReload = await pressLayout('r', 'KeyO');
check('Dvorak Ctrl+R is left to the browser', stoleReload === false, 'the app called preventDefault on the reload shortcut');
// Colemak's J sits on QWERTY's Y. Chrome's downloads shortcut must survive.
const stoleDownloads = await pressLayout('j', 'KeyY');
check('Colemak Ctrl+J is left to the browser', stoleDownloads === false, 'the app called preventDefault on the downloads shortcut');
// ...and the reason the position fallback exists at all: a Cyrillic layout gives
// no Latin letter to read, so position is all there is.
await page.keyboard.press('Control+z');
await page.waitForTimeout(250);
const beforeCyrillic = await textarea().inputValue();
await pressLayout('я', 'KeyZ');
await page.waitForTimeout(250);
check('Cyrillic Ctrl+я still undoes', (await textarea().inputValue()) !== beforeCyrillic, `stayed at ${JSON.stringify(beforeCyrillic)}`);

// ── 20. Scenery says nothing it cannot do ───────────────────────────────────
//
// The rooms are illusions, and the illusion is carried by shape: peripheral
// vision resolves rhythm and contrast, not lexemes. A word in the scenery does
// nothing for the atmosphere, and becomes legible only when you look straight at
// it — which is exactly when it can lie. So every interactive thing in a room is
// real, and decoration is wordless.
//
// With one distinction, because "no words" is the wrong rule by a hair: scenery
// may name a SLOT or the SCENE, but may not assert a FACT. "To:" over an empty
// line claims nothing — the room IS an unaddressed email. "Calibri" claimed the
// font was Calibri and it wasn't; "Page 1 of 1" claimed a page count that was
// always 1; "Send" named an action the button didn't perform. Those are checkable
// assertions, and they were false.
//
// The allowlist is the point of this test, not an exemption from it: adding a
// word to decoration means adding it here and arguing it names a slot or the
// scene. Anything unlisted fails.
const SCENERY_MAY_SAY = [
	/^(To|Subject|Cc|Bcc):$/, // slots, visibly empty
	/^-- INSERT --$/, // true whenever the writer is typing
	/^~\/drafts$/, // Term's establishing shot, not a control
	/^vi draft\.txt$/
];
await page.goto(BASE + '/', { waitUntil: 'networkidle' });
for (const room of ['Bare', 'Scratch', 'Pad', 'Term', 'Mail', 'Doc', 'Post', 'Yours']) {
	await tab(room).click();
	await page.waitForTimeout(200);
	const fake = await page.evaluate(() => {
		// Decoration is marked aria-hidden. Read what it says — text node by text
		// node, since a wrapper's textContent would glue "To:" and "Subject:" into
		// one string that matches nothing.
		const said = new Set();
		for (const root of document.querySelectorAll('main [aria-hidden="true"]')) {
			const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
			let n;
			while ((n = walk.nextNode())) {
				const t = (n.nodeValue ?? '').trim();
				if (t) said.add(t);
			}
		}
		// Buttons a mouse can press: each must be a real control, i.e. reachable to
		// a screen reader too. A pressable thing inside aria-hidden is a dead end.
		const deadButtons = [...document.querySelectorAll('main button')].filter((b) =>
			b.closest('[aria-hidden="true"]')
		).length;
		return { said: [...said], deadButtons };
	});
	const claims = fake.said.filter((t) => /[A-Za-z]{3,}/.test(t) && !SCENERY_MAY_SAY.some((ok) => ok.test(t)));
	check(
		`${room}: scenery makes no claim it cannot keep`,
		claims.length === 0,
		claims.length ? `decoration reading ${claims.map((c) => JSON.stringify(c)).join(', ')}` : ''
	);
	check(`${room}: no button a screen reader cannot reach`, fake.deadButtons === 0, `${fake.deadButtons} pressable control(s) inside decoration`);
}

// Both terminal guards, together and last, so an appended section can't fall
// outside them the way this one silently did.
check('no page JS errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

// Must be last: every request made during the entire run stays same-origin.
check('no cross-origin requests', crossOrigin.length === 0, crossOrigin.slice(0, 3).join(' '));

await browser.close();
const failed = results.filter((r) => !r.ok);
const expected = results.filter((r) => r.known && r.ok);
const real = results.length - expected.length;
console.log(
	`\n${real - failed.length}/${real} passed · ${expected.length} known limitation${expected.length === 1 ? '' : 's'} · ${failed.length} failed · screenshots in ${SHOTS}`
);
process.exit(failed.length ? 1 : 0);

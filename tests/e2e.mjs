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

const browser = await chromium.launch({ executablePath: findChromium() });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));

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
	'plain <b>not html</b> & ampersand'
];
async function richTouch() {
	await tab('Doc').click();
	await rich().click();
	await page.keyboard.press('Control+End');
	await page.keyboard.type('x');
	await page.keyboard.press('Backspace');
	await page.waitForTimeout(100);
}
const STABLE_EXACT = new Set(['a * b * c', 'para1\n\npara2', 'ends with newline\n']);
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

// ── 9. Mail: Ctrl+I, Cc/Bcc reveal + persistence ─────────────────────────────
await tab('Term').click();
await textarea().fill('emphasis test');
await tab('Mail').click();
await rich().click();
await page.keyboard.press('Control+a');
await page.keyboard.press('Control+i');
await page.waitForTimeout(300);
check('mail Ctrl+I italicizes', (await rich().locator('i, em').count()) >= 1, await rich().innerHTML());
await page.getByRole('button', { name: 'Cc Bcc' }).click();
await page.locator('#mail-cc').fill('cc@example.com');
await page.waitForTimeout(900);
await page.reload({ waitUntil: 'networkidle' });
check('cc revealed + persisted after reload', (await page.locator('#mail-cc').inputValue()) === 'cc@example.com');

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
for (const shell of ['Bare', 'Scratch', 'Pad', 'Term', 'Mail', 'Doc', 'Post']) {
	await tab(shell).click();
	await page.waitForTimeout(250);
	await page.screenshot({ path: path.join(SHOTS, `${shell.toLowerCase()}.png`) });
}
check('no page JS errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed · screenshots in ${SHOTS}`);
process.exit(failed.length ? 1 : 0);

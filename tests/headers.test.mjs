/**
 * The rules verify-deployment.mjs holds a live deployment to.
 *
 * These matter more than their size suggests. `_headers` cannot be hashed like
 * the rest of the build, so for a long time it was skipped and checked by
 * nothing — a deployment could serve every byte of the public source and quietly
 * drop the service worker's `default-src 'none'; connect-src 'self'`, and the
 * verifier would call it exactly the public source. The worker is the one
 * context a page's CSP cannot reach; that header is what keeps it from talking
 * to any origin it likes.
 *
 * So the predicate below is load-bearing, and it is wrong in two opposite and
 * tempting ways. Both are pinned here.
 *
 * Run: pnpm test:unit
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { expectedHeaders, headerSatisfied, parseHeaderRules } from '../scripts/headers.mjs';

const REAL = readFileSync(new URL('../static/_headers', import.meta.url), 'utf8');

test('parses the real _headers, comments and all', () => {
	const rules = parseHeaderRules(REAL);
	assert.deepEqual(
		rules.map((r) => r.pattern),
		['/*', '/service-worker.js', '/_app/immutable/*']
	);
	// A comment line must never be read as a rule pattern — _headers is heavily
	// commented, and a stray rule would silently expect headers of nothing.
	assert.ok(!rules.some((r) => r.pattern.startsWith('#')));
	const root = rules[0].headers.map(([n]) => n);
	assert.ok(root.includes('referrer-policy') && root.includes('content-security-policy'));
});

test('every rule that matches applies, not just the most specific', () => {
	// Cloudflare appends: /service-worker.js really is served two CSP headers,
	// one from /* and one from its own block. Take the most specific only and
	// the check stops looking at frame-ancestors for that path.
	const want = expectedHeaders(parseHeaderRules(REAL), '/service-worker.js');
	assert.deepEqual(want.get('content-security-policy'), [
		"frame-ancestors 'none'",
		"default-src 'none'; connect-src 'self'; script-src 'self'"
	]);
	assert.equal(want.get('referrer-policy')?.length, 1);
	// /* matches the hashed assets too, so they keep the security headers AND
	// pick up their own Cache-Control.
	const asset = expectedHeaders(parseHeaderRules(REAL), '/_app/immutable/chunks/x.js');
	assert.ok(asset.has('cache-control') && asset.has('x-content-type-options'));
	// ...and a path no specific rule names still gets /*.
	assert.ok(expectedHeaders(parseHeaderRules(REAL), '/').has('permissions-policy'));
});

test('a weaker policy that merely CONTAINS the required one is caught', () => {
	// The trap that makes containment unusable, and it is not hypothetical: the
	// footer links to GitHub, so no-referrer-when-downgrade ships the full URL
	// there on every click (https→https is not a downgrade). `no-referrer` is a
	// substring of it, so `.includes()` would certify the leak as verified.
	assert.equal(headerSatisfied('no-referrer-when-downgrade', 'no-referrer'), false);
	assert.equal(headerSatisfied('same-origin-allow-popups', 'same-origin'), false);
	assert.equal(headerSatisfied('SAMEORIGIN', 'DENY'), false);
	assert.equal(headerSatisfied('unsafe-url', 'no-referrer'), false);
	assert.equal(headerSatisfied(null, 'no-referrer'), false);
	// ...while the real value still passes.
	assert.equal(headerSatisfied('no-referrer', 'no-referrer'), true);
	assert.equal(headerSatisfied('same-origin', 'same-origin'), true);
});

test('a healthy value that contains its own commas is not split into nonsense', () => {
	// The opposite trap. Split on commas and this one value becomes five, none
	// of which equals the expectation — a healthy deployment reported as tampered.
	// A check that cries wolf on every clean run gets ignored, then removed.
	const pp = 'camera=(), microphone=(), geolocation=(), payment=(), usb=()';
	assert.equal(headerSatisfied(pp, pp), true);
	assert.equal(headerSatisfied('public, max-age=31536000, immutable', 'public, max-age=31536000, immutable'), true);
	// And a genuinely different Permissions-Policy is still caught.
	assert.equal(headerSatisfied('camera=*, microphone=()', pp), false);
});

test('a repeated header is matched member-wise, not by its joined string', () => {
	// fetch() surfaces two CSP headers as one comma-joined value. Each expected
	// value has to be found in it, without the join itself ever matching.
	const joined = "frame-ancestors 'none', default-src 'none'; connect-src 'self'; script-src 'self'";
	assert.equal(headerSatisfied(joined, "frame-ancestors 'none'"), true);
	assert.equal(headerSatisfied(joined, "default-src 'none'; connect-src 'self'; script-src 'self'"), true);
	// The worker CSP gutted while frame-ancestors survives: the join no longer
	// carries the value, and this is exactly the tamper worth catching.
	const gutted = "frame-ancestors 'none', default-src *; connect-src *";
	assert.equal(headerSatisfied(gutted, "default-src 'none'; connect-src 'self'; script-src 'self'"), false);
	// Dropped entirely.
	assert.equal(headerSatisfied("frame-ancestors 'none'", "default-src 'none'; connect-src 'self'; script-src 'self'"), false);
});

test('the real _headers is satisfied by the headers it itself asks for', () => {
	// Round trip: whatever the file asks for must be accepted when served back
	// verbatim, including the joined duplicates. If this fails, every clean
	// deployment fails.
	const rules = parseHeaderRules(REAL);
	for (const path of ['/', '/verify', '/service-worker.js', '/_app/immutable/chunks/a.js', '/icons/icon.png']) {
		for (const [name, values] of expectedHeaders(rules, path)) {
			const served = values.join(', ');
			for (const v of values) {
				assert.ok(headerSatisfied(served, v), `${path} ${name}: ${JSON.stringify(v)} not found in ${JSON.stringify(served)}`);
			}
		}
	}
});

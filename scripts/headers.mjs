// Reading `_headers` — Cloudflare's format, and the two traps in holding a live
// response to it. Its own module so the rules are testable without a network:
// verify-deployment.mjs is a top-level-await script that talks to the internet
// the moment it is imported, and a predicate this easy to get quietly wrong
// should be tested for real rather than reimplemented in a test and asserted
// against itself. See tests/headers.test.mjs.

/** Parse `_headers` into ordered rules. Comments and blank lines are ignored. */
export function parseHeaderRules(text) {
	const rules = [];
	for (const raw of text.split('\n')) {
		const line = raw.replace(/#.*$/, '').replace(/\s+$/, '');
		if (!line.trim()) continue;
		if (!/^\s/.test(line)) rules.push({ pattern: line.trim(), headers: [] });
		else if (rules.length) {
			const i = line.indexOf(':');
			if (i > 0) rules.at(-1).headers.push([line.slice(0, i).trim().toLowerCase(), line.slice(i + 1).trim()]);
		}
	}
	return rules;
}

const globToRe = (pattern) =>
	new RegExp('^' + pattern.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');

/**
 * Every value every matching rule asks for, keyed by header name.
 *
 * All matching rules, not the most specific one: Cloudflare APPENDS. It really
 * does send /service-worker.js two Content-Security-Policy headers — one from
 * `/*`, one from its own block — and the browser enforces both.
 */
export function expectedHeaders(rules, path) {
	const want = new Map();
	for (const rule of rules) {
		if (!globToRe(rule.pattern).test(path)) continue;
		for (const [name, value] of rule.headers) {
			if (!want.has(name)) want.set(name, []);
			want.get(name).push(value);
		}
	}
	return want;
}

/**
 * Is `want` one of the values actually served under this name?
 *
 * NOT a substring test. `no-referrer-when-downgrade` contains `no-referrer`,
 * and https→https is not a downgrade, so containment would wave through a
 * policy that hands the full URL to every site this one links to — the exact
 * leak the header exists to stop. `same-origin-allow-popups` hides inside
 * `same-origin` the same way.
 *
 * NOT a plain split on commas either. fetch joins repeated headers with a
 * comma, but commas also live *inside* legitimate values: `camera=(),
 * microphone=()` is ONE value, and splitting it makes a healthy deployment
 * look broken. So: the whole value first, then exact membership of the join.
 * A value carrying its own commas is caught by the former; a name sent more
 * than once by the latter. Nothing is asserted about headers we did not ask
 * for — Cloudflare adds its own (report-to, nel) and that is not tampering.
 */
export const headerSatisfied = (got, want) =>
	got !== null &&
	(got.trim() === want.trim() || got.split(',').some((part) => part.trim() === want.trim()));

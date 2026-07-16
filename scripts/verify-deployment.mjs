// Independent deployment verification: proves the deployed site is
// byte-for-byte the output of building the public source. No dependencies.
//
// Usage:
//   pnpm build                                        # build the checkout
//   node scripts/verify-deployment.mjs [base-url]     # default https://onesown.app
//
// Compares every file in build/ against the bytes the server returns.
// Two files cannot be hash-compared, so each is cross-checked another way —
// which the comment here once claimed of both while only one was true:
//   - .well-known/deployment.json  carries builtAt/buildId (non-reproducible
//     by design); its commit field is checked against the built version.json.
//   - _headers                     parsed by Cloudflare at the edge, never
//     served; the headers it asks for are held against the live responses.
// See DEPLOYMENT_VERIFICATION.md for the full trust model.
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expectedHeaders, headerSatisfied, parseHeaderRules } from './headers.mjs';

const BASE = (process.argv[2] ?? 'https://onesown.app').replace(/\/+$/, '');
const ROOT = 'build';

if (!existsSync(join(ROOT, 'index.html'))) {
	console.error('No build/ output found — run `pnpm build` first.');
	process.exit(2);
}

function* walk(dir) {
	for (const entry of readdirSync(dir)) {
		const p = join(dir, entry);
		if (statSync(p).isDirectory()) yield* walk(p);
		else yield p;
	}
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

// Map a build file to its served URL (Kit trailingSlash default: 'never').
const toUrl = (rel) => {
	if (rel === 'index.html') return '/';
	if (rel.endsWith('/index.html')) return '/' + rel.slice(0, -'/index.html'.length);
	if (rel.endsWith('.html')) return '/' + rel.slice(0, -'.html'.length);
	return '/' + rel;
};

const SKIP = new Set(['.well-known/deployment.json', '_headers']);

// ── The headers _headers asks for ───────────────────────────────────────────
// This file is Cloudflare's: parsed at the edge, never served, so it cannot be
// hashed like everything else. It was therefore skipped and then checked by
// nothing at all — which meant a deployment could serve every byte of the
// public source faithfully, quietly drop the service worker's
// `default-src 'none'; connect-src 'self'`, and still be told it was exactly
// that source. That one header is all that stands between the worker and any
// origin it cares to talk to: a page's CSP is bound to the document and cannot
// reach a worker, which is the whole reason static/_headers grants it its own.
// So: read the local file and hold the live responses to what it asks for. The
// verifier builds from the published commit, so the expectations here are the
// published ones — a deployment that ships different rules disagrees with them.
// The parsing and matching rules live in ./headers.mjs, where they are tested.

// _headers is applied by Cloudflare, so a local origin serves none of it and an
// ungated check would fail for a reason that says nothing about the deployment.
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE);
const headerRules = existsSync(join(ROOT, '_headers'))
	? parseHeaderRules(readFileSync(join(ROOT, '_headers'), 'utf8'))
	: [];

let matched = 0;
let headersChecked = 0;
const failures = [];
for (const path of walk(ROOT)) {
	const rel = path.slice(ROOT.length + 1).replaceAll('\\', '/');
	if (SKIP.has(rel)) continue;
	const local = sha256(readFileSync(path));
	const url = toUrl(rel);
	let remote;
	let res = null;
	try {
		res = await fetch(BASE + url, { redirect: 'manual' });
		remote = res.ok ? sha256(Buffer.from(await res.arrayBuffer())) : `HTTP ${res.status}`;
	} catch (e) {
		remote = `fetch failed: ${e.message ?? e}`;
	}
	if (remote === local) {
		matched++;
		console.log(`  ok       ${rel}`);
	} else {
		failures.push(rel);
		console.log(`  MISMATCH ${rel}\n           local  ${local}\n           remote ${remote}`);
	}
	// Assert on the response already in hand — no second request.
	if (!LOCAL_ORIGIN && res?.ok) {
		for (const [name, values] of expectedHeaders(headerRules, url)) {
			const got = res.headers.get(name);
			for (const want of values) {
				headersChecked++;
				if (headerSatisfied(got, want)) continue;
				failures.push(`${url} header ${name}`);
				console.log(
					`  HEADER   ${url}\n           ${name}\n           want   ${want}\n           got    ${got ?? '(absent)'}`
				);
			}
		}
	}
}
if (LOCAL_ORIGIN) {
	console.log('\n  SKIP     security headers — _headers is applied by Cloudflare, not by a local server');
} else {
	console.log(`\n${headersChecked} security header(s) from _headers held against the live responses.`);
}

// Attestation cross-checks: served deployment.json and version.json must agree
// with each other and (if this checkout is the attested commit) with git HEAD.
let attested = null;
try {
	const res = await fetch(`${BASE}/.well-known/deployment.json`);
	if (res.ok) attested = await res.json();
} catch {
	/* reported below */
}
let head = null;
try {
	head = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
} catch {
	/* not a git checkout */
}

if (!attested) {
	failures.push('.well-known/deployment.json');
	console.log('  MISSING  .well-known/deployment.json');
} else {
	console.log(`\nServer attests commit ${attested.commit} (${attested.builder}, built ${attested.builtAt})`);
	const versionJson = JSON.parse(readFileSync(join(ROOT, '_app', 'version.json'), 'utf8'));
	if (attested.commit !== versionJson.version) {
		failures.push('attestation/version.json disagreement');
		console.log(`  MISMATCH attested commit != built version.json (${versionJson.version})`);
	}
	if (head && attested.commit !== head) {
		console.log(
			`  NOTE     local checkout is ${head.slice(0, 7)}, server attests ${attested.commit.slice(0, 7)} — check out the attested commit to verify it.`
		);
	}
}

console.log(`\n${matched} file(s) verified byte-for-byte against ${BASE}; ${failures.length} problem(s).`);
if (failures.length === 0) {
	console.log('VERIFIED: the deployment is exactly the output of this source tree.');
}
process.exit(failures.length ? 1 : 0);

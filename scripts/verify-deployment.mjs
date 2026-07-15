// Independent deployment verification: proves the deployed site is
// byte-for-byte the output of building the public source. No dependencies.
//
// Usage:
//   pnpm build                                        # build the checkout
//   node scripts/verify-deployment.mjs [base-url]     # default https://onesown.app
//
// Compares every file in build/ against the bytes the server returns.
// Exclusions (each cross-checked instead of hash-compared):
//   - .well-known/deployment.json  carries builtAt/buildId (non-reproducible
//     by design); its commit field must match the local checkout instead.
//   - _headers                     parsed by Cloudflare, never served.
// See DEPLOYMENT_VERIFICATION.md for the full trust model.
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

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

let matched = 0;
const failures = [];
for (const path of walk(ROOT)) {
	const rel = path.slice(ROOT.length + 1).replaceAll('\\', '/');
	if (SKIP.has(rel)) continue;
	const local = sha256(readFileSync(path));
	let remote;
	try {
		const res = await fetch(BASE + toUrl(rel), { redirect: 'manual' });
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

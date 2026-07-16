/**
 * The dirty gate in scripts/verify-deployment.mjs, exercised for real: a tiny
 * fixture "deployment" is served over http and the actual script is run against
 * it as a subprocess — no mock of the script, no stubbed fetch.
 *
 * A build from a tree with uncommitted changes reproduces from no commit, so it
 * must never earn VERIFIED. This proves the gate both ways: dirty fails, and the
 * same fixture without the flag passes — so the failure is the flag, not the
 * fixture.
 *
 * Run: pnpm test:unit
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, extname } from 'node:path';
import { tmpdir } from 'node:os';

const SCRIPT = new URL('../scripts/verify-deployment.mjs', import.meta.url).pathname;
const COMMIT = 'a'.repeat(40);
const INDEX = '<!doctype html><title>fixture</title>';

// A minimal build/ the script can walk and byte-compare. deployment.json and
// _headers are the two files it never hashes, so their contents are free to
// carry the attestation — which is the whole point here.
function makeFixture(dirty) {
	const root = mkdtempSync(join(tmpdir(), 'onesown-dirty-'));
	const build = join(root, 'build');
	mkdirSync(join(build, '_app'), { recursive: true });
	mkdirSync(join(build, '.well-known'), { recursive: true });
	writeFileSync(join(build, 'index.html'), INDEX);
	writeFileSync(join(build, '_app', 'version.json'), JSON.stringify({ version: COMMIT }));
	writeFileSync(join(build, '_headers'), '/*\n  X-Content-Type-Options: nosniff\n');
	writeFileSync(
		join(build, '.well-known', 'deployment.json'),
		JSON.stringify({ commit: COMMIT, builder: 'test', builtAt: 'now', ...(dirty ? { dirty: true } : {}) })
	);
	return { root, build };
}

const TYPES = { '.html': 'text/html', '.json': 'application/json' };
function serve(build) {
	const server = createServer((req, res) => {
		const path = new URL(req.url, 'http://x').pathname;
		const rel = path === '/' ? 'index.html' : path.slice(1);
		try {
			// Reuse the fixture's own bytes so the byte comparison always matches;
			// the deployment.json is served from .well-known verbatim.
			const body = readFixture(build, rel);
			res.writeHead(200, { 'content-type': TYPES[extname(rel)] ?? 'application/octet-stream' });
			res.end(body);
		} catch {
			res.writeHead(404);
			res.end();
		}
	});
	return server;
}

import { readFileSync } from 'node:fs';
function readFixture(build, rel) {
	return readFileSync(join(build, rel));
}

// Async, deliberately: the fixture server runs in THIS process, so a synchronous
// spawn would block the event loop and the subprocess's fetches would never be
// answered — a deadlock, not a failure.
async function runVerify(root, base) {
	try {
		const { stdout } = await execFileAsync('node', [SCRIPT, base], { cwd: root });
		return { code: 0, out: stdout };
	} catch (e) {
		return { code: e.code ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
	}
}

async function withServer(build, fn) {
	const server = serve(build);
	await new Promise((r) => server.listen(0, '127.0.0.1', r));
	const base = `http://127.0.0.1:${server.address().port}`;
	try {
		return await fn(base);
	} finally {
		server.close();
	}
}

test('a dirty attestation never reaches VERIFIED', async () => {
	const { root, build } = makeFixture(true);
	try {
		const { code, out } = await withServer(build, (base) => runVerify(root, base));
		assert.match(out, /DIRTY/, out);
		assert.doesNotMatch(out, /^VERIFIED/m, out);
		assert.equal(code, 1, out);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('the same fixture without the flag verifies — so the failure is the flag', async () => {
	const { root, build } = makeFixture(false);
	try {
		const { code, out } = await withServer(build, (base) => runVerify(root, base));
		assert.match(out, /VERIFIED/, out);
		assert.equal(code, 0, out);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

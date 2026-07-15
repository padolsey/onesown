// Emits build/.well-known/deployment.json — the deployment attestation served
// at https://onesown.app/.well-known/deployment.json. Runs as the second half
// of `pnpm build`, so it is produced identically by local builds, GitHub CI,
// and Cloudflare Workers Builds (which injects the WORKERS_CI_* variables).
//
// NOTE: builtAt/buildId make this the ONE non-reproducible file in the build;
// scripts/verify-deployment.mjs excludes it from byte comparison and instead
// cross-checks its commit field. See DEPLOYMENT_VERIFICATION.md.
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const git = (cmd) => {
	try {
		return execSync(cmd, { encoding: 'utf8' }).trim();
	} catch {
		return null;
	}
};

const commit = process.env.WORKERS_CI_COMMIT_SHA ?? git('git rev-parse HEAD');
const branch = process.env.WORKERS_CI_BRANCH ?? git('git rev-parse --abbrev-ref HEAD');
// A local build from a dirty tree is NOT the attested commit — say so.
const dirty = !process.env.WORKERS_CI_COMMIT_SHA && git('git status --porcelain') !== '';

if (!commit || !/^[0-9a-f]{40}$/.test(commit)) {
	console.error(`emit-deployment-metadata: no usable commit SHA (got ${JSON.stringify(commit)})`);
	process.exit(1);
}
if (!existsSync('build/index.html')) {
	console.error('emit-deployment-metadata: build/ missing — run vite build first');
	process.exit(1);
}

const metadata = {
	app: "A Room of One's Own",
	canonical: 'https://onesown.app',
	repository: 'https://github.com/padolsey/onesown',
	commit,
	commitUrl: `https://github.com/padolsey/onesown/commit/${commit}`,
	branch,
	builtAt: new Date().toISOString(),
	builder:
		process.env.WORKERS_CI === '1'
			? 'cloudflare-workers-builds'
			: process.env.CI
				? 'ci'
				: 'local',
	buildId: process.env.WORKERS_CI_BUILD_UUID ?? null,
	...(dirty ? { dirty: true } : {}),
	verify: 'https://onesown.app/verify',
	documentation: 'https://github.com/padolsey/onesown/blob/main/DEPLOYMENT_VERIFICATION.md'
};

mkdirSync('build/.well-known', { recursive: true });
writeFileSync('build/.well-known/deployment.json', JSON.stringify(metadata, null, '\t') + '\n');
console.log(`deployment.json: ${commit.slice(0, 7)} on ${branch} (${metadata.builder})`);

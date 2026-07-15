import { execSync } from 'node:child_process';
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// The commit being built. Workers Builds injects WORKERS_CI_COMMIT_SHA; local
// builds ask git. Using it as the Kit version (instead of the Date.now()
// default) makes builds bit-for-bit reproducible and publishes the deployed
// SHA at /_app/version.json — see DEPLOYMENT_VERIFICATION.md.
const commit =
	process.env.WORKERS_CI_COMMIT_SHA ??
	execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// Fully prerendered (see src/routes/+layout.ts) — the deploy is an
		// assets-only Cloudflare Worker with no server code at all.
		adapter: adapter(),
		version: { name: commit },
		// Browser-enforced no-exfiltration policy. Prerendered pages carry this
		// as a <meta> tag with hashes for Kit's inline bootstrap script;
		// frame-ancestors can't live in a meta CSP, so it's set in
		// static/_headers instead. 'unsafe-inline' for styles covers the shells'
		// inline style attributes — with img/connect/font sources locked to
		// 'self', styles are not a usable exfiltration channel.
		csp: {
			mode: 'hash',
			directives: {
				'default-src': ['none'],
				'script-src': ['self'],
				'style-src': ['self', 'unsafe-inline'],
				'img-src': ['self', 'data:'],
				'connect-src': ['self'],
				'base-uri': ['none'],
				'form-action': ['none'],
				'object-src': ['none'],
				'manifest-src': ['self']
			}
		}
	}
};

export default config;

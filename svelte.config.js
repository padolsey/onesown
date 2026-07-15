import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// Fully prerendered (see src/routes/+layout.ts) — the deploy is an
		// assets-only Cloudflare Worker with no server code at all.
		adapter: adapter()
	}
};

export default config;

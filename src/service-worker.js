/// <reference types="@sveltejs/kit" />
/**
 * Offline support. Strictly same-origin (the app makes no other requests and
 * the CSP forbids them): content-hashed build assets are served cache-first,
 * everything else network-first with cache fallback, so a writer who has
 * visited once can open the room with no connection at all.
 *
 * `version` is the git commit SHA (svelte.config.js), so each deploy gets its
 * own cache and old ones are dropped on activate. Verification note: a browser
 * may keep running a previously-cached version until the worker updates — see
 * DEPLOYMENT_VERIFICATION.md, "Offline behavior".
 */
import { build, files, version } from '$service-worker';

const CACHE = `onesown-${version}`;
// _headers is Cloudflare configuration, parsed at the edge and never served.
const ASSETS = [...build, ...files.filter((f) => !f.endsWith('/_headers')), '/', '/verify'];

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(ASSETS))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== location.origin) return;

	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);
			// Content-hashed forever-cacheable assets: cache first.
			if (url.pathname.startsWith('/_app/immutable/')) {
				const hit = await cache.match(request);
				if (hit) return hit;
			}
			try {
				const response = await fetch(request);
				if (response.ok) cache.put(request, response.clone());
				return response;
			} catch {
				const hit =
					(await cache.match(request)) ??
					(request.mode === 'navigate' ? await cache.match('/') : undefined);
				if (hit) return hit;
				return Response.error();
			}
		})()
	);
});

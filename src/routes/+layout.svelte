<script lang="ts">
	import { untrack } from 'svelte';
	import '../app.css';
	import { browser, dev } from '$app/environment';
	import { prefs } from '$lib/prefs.svelte';

	let { children } = $props();

	$effect(() => untrack(() => prefs.load()));

	// The theme override reaches the document root so scrollbars, form controls
	// and overscroll match it — html[data-theme] rules live in app.css. It lives
	// in the layout, not the page, because the preference is the writer's rather
	// than the room's: /verify is reached from the footer of a themed page and
	// has to arrive already wearing it.
	$effect(() => {
		if (prefs.theme === 'system') delete document.documentElement.dataset.theme;
		else document.documentElement.dataset.theme = prefs.theme;
		return () => delete document.documentElement.dataset.theme;
	});

	// Manual registration (kit.serviceWorker.register is off) so dev and the
	// e2e suite never run behind a cache.
	$effect(() => {
		if (browser && !dev && 'serviceWorker' in navigator) {
			navigator.serviceWorker.register('/service-worker.js').catch(() => {});
		}
	});
</script>

{@render children()}

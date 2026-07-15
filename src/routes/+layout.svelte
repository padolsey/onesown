<script lang="ts">
	import '../app.css';
	import { browser, dev } from '$app/environment';

	let { children } = $props();

	// Manual registration (kit.serviceWorker.register is off) so dev and the
	// e2e suite never run behind a cache.
	$effect(() => {
		if (browser && !dev && 'serviceWorker' in navigator) {
			navigator.serviceWorker.register('/service-worker.js').catch(() => {});
		}
	});
</script>

{@render children()}

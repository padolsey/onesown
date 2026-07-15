<script lang="ts">
	import { version } from '$app/environment';

	// The attestation the server is actually serving right now — fetched live so
	// a mismatch with this page's build-time commit is visible (e.g. a stale
	// cached page). null = not loaded yet; false = unavailable (dev server).
	interface Attestation {
		commit: string;
		commitUrl: string;
		branch: string;
		builtAt: string;
		builder: string;
		repository: string;
	}
	let served = $state<Attestation | null | false>(null);

	$effect(() => {
		fetch('/.well-known/deployment.json')
			.then((r) => (r.ok ? r.json() : false))
			.then((d) => (served = d))
			.catch(() => (served = false));
	});

	const short = version.slice(0, 7);
</script>

<svelte:head>
	<title>Verify this deployment — A Room of One’s Own</title>
	<meta
		name="description"
		content="How to verify that the code serving onesown.app is exactly the public source — and what that does and doesn’t prove."
	/>
	<link rel="canonical" href="https://onesown.app/verify" />
</svelte:head>

<div class="v-app min-h-screen">
	<div class="mx-auto max-w-2xl px-4 pb-20 pt-10 sm:px-6">
		<header class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
			<a href="/" class="v-wordmark">A Room of One’s Own</a>
			<h1 class="v-muted text-[0.95rem] font-normal">verify this deployment</h1>
		</header>

		<section class="mt-8">
			<h2 class="v-h2">This deployment</h2>
			<dl class="v-facts mt-3">
				<dt>Commit</dt>
				<dd>
					<a class="v-link" href={`https://github.com/padolsey/onesown/commit/${version}`}
						><code data-commit>{version}</code></a
					>
				</dd>
				<dt>Source</dt>
				<dd>
					<a class="v-link" href="https://github.com/padolsey/onesown"
						>github.com/padolsey/onesown</a
					>
				</dd>
				{#if served}
					<dt>Branch</dt>
					<dd>{served.branch}</dd>
					<dt>Built</dt>
					<dd>{served.builtAt} by {served.builder}</dd>
					<dt>Attestation</dt>
					<dd>
						<a class="v-link" href="/.well-known/deployment.json">/.well-known/deployment.json</a>
						{#if served.commit === version}
							— matches this page ✓
						{:else}
							— <strong>does not match this page</strong> (page {short}, server
							{served.commit.slice(0, 7)}; you may be seeing a cached page from an older deploy)
						{/if}
					</dd>
				{:else if served === false}
					<dt>Attestation</dt>
					<dd>/.well-known/deployment.json is unavailable (development build)</dd>
				{/if}
			</dl>
		</section>

		<section class="mt-8">
			<h2 class="v-h2">The trust model, plainly</h2>
			<ul class="v-list mt-3">
				<li>
					The source is public. Production is built and deployed by <strong
						>Cloudflare Workers Builds</strong
					>
					from the repository’s <code>main</code> branch — Cloudflare is the trusted hosting and
					build party.
				</li>
				<li>
					There is <strong>no server code</strong>. The deployment is a fixed set of static files;
					everything the site can do is in the JavaScript you can read and verify.
				</li>
				<li>
					A Content-Security-Policy — enforced by <em>your browser</em>, not by this site — blocks
					requests to any other origin. Your draft lives in this browser’s local storage and is
					never transmitted.
				</li>
				<li>
					Builds are reproducible: building the commit above yields byte-for-byte the files this
					site serves. That check is the only part that requires trusting no one — you can run it
					yourself.
				</li>
			</ul>
		</section>

		<section class="mt-8">
			<h2 class="v-h2">Verify it yourself</h2>
			<pre class="v-code mt-3"><code
					>git clone https://github.com/padolsey/onesown
cd onesown && git checkout {short}
corepack enable && pnpm install --frozen-lockfile
pnpm build
node scripts/verify-deployment.mjs https://onesown.app</code
				></pre>
			<p class="v-muted mt-3 text-sm">
				The script hashes every file your build produced and compares it against the bytes this
				site serves. Full procedure and trust notes:
				<a
					class="v-link"
					href="https://github.com/padolsey/onesown/blob/main/DEPLOYMENT_VERIFICATION.md"
					>DEPLOYMENT_VERIFICATION.md</a
				>.
			</p>
		</section>

		<section class="mt-8">
			<h2 class="v-h2">What this does not prove</h2>
			<ul class="v-list mt-3">
				<li>
					Verification is <strong>per-version</strong>: it proves the deployment you checked, at
					the time you checked it. A future deploy could behave differently — the commit history
					is append-only precisely so past claims stay auditable.
				</li>
				<li>
					“Production deploys only through Cloudflare Builds” is operating policy, not a
					technical guarantee — the account owner could deploy manually. The reproducibility
					check is how you’d notice.
				</li>
				<li>
					Cloudflare (serving, TLS, the build pipeline) and your own browser and extensions are
					outside what this page can attest to.
				</li>
				<li>
					No web page can honestly claim it is <em>mathematically incapable</em> of tracking you.
					This one claims something narrower and checkable: the code being served is the public
					code, it makes no outbound requests, and your browser is instructed to refuse any it
					might make.
				</li>
			</ul>
		</section>

		<p class="v-muted mt-10 text-sm">
			<a href="/" class="v-link">← Back to the room</a>
		</p>
	</div>
</div>

<style>
	.v-app {
		--bg: #f2efe9;
		--fg: #2f2b25;
		--muted: #6c6456;
		--line: #d9d3c7;
		background: var(--bg);
		color: var(--fg);
		font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
		font-size: 0.95rem;
		line-height: 1.65;
	}
	/* Dark by OS by default, but a theme the writer pinned back in the room wins:
	   the footer's Verify link is how they got here, so the page has to arrive
	   wearing what they chose. :global reaches the root attribute the layout
	   sets. Both overrides outrank the media query on specificity (0,2,1 beats
	   0,1,0), so neither depends on source order. */
	@media (prefers-color-scheme: dark) {
		.v-app {
			--bg: #191817;
			--fg: #e6e1d7;
			--muted: #98917f;
			--line: #383530;
		}
	}
	:global(html[data-theme='light']) .v-app {
		--bg: #f2efe9;
		--fg: #2f2b25;
		--muted: #6c6456;
		--line: #d9d3c7;
	}
	:global(html[data-theme='dark']) .v-app {
		--bg: #191817;
		--fg: #e6e1d7;
		--muted: #98917f;
		--line: #383530;
	}
	.v-wordmark {
		font-family: Georgia, 'Times New Roman', serif;
		font-style: italic;
		font-size: 1.4rem;
		font-weight: 700;
		letter-spacing: -0.01em;
	}
	.v-h2 {
		font-family: Georgia, 'Times New Roman', serif;
		font-style: italic;
		font-size: 1.15rem;
		font-weight: 700;
	}
	.v-muted {
		color: var(--muted);
	}
	.v-link {
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.v-link:hover {
		color: var(--muted);
	}
	.v-facts {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.3rem 1.25rem;
	}
	.v-facts dt {
		color: var(--muted);
	}
	.v-facts dd {
		overflow-wrap: anywhere;
	}
	.v-list {
		list-style: disc;
		padding-left: 1.25rem;
		display: grid;
		gap: 0.6rem;
	}
	.v-code {
		border: 1px solid var(--line);
		border-radius: 0.5rem;
		padding: 0.9rem 1rem;
		overflow-x: auto;
		font-size: 0.8rem;
		line-height: 1.6;
	}
	code {
		font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
		font-size: 0.9em;
	}
</style>

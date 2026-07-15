# Deployment verification

This document explains how https://onesown.app is deployed, what you can
verify about it, exactly what that verification proves, and — just as
importantly — what it does not.

The short version: **the site is a fixed set of static files, reproducibly
built from this public repository, served with a browser-enforced policy that
forbids talking to any other origin.** Anyone can check all three claims
without trusting the operator.

## What is deployed

- The site is **fully prerendered** (`@sveltejs/adapter-static`) and deployed
  as an **assets-only Cloudflare Worker** — there is no server code. Every
  byte of the deployment is a static file you can fetch and hash.
- All deployment configuration is committed: `wrangler.jsonc` (worker name,
  custom domain, assets directory), `svelte.config.js` (adapter, CSP,
  deterministic build version), `static/_headers` (security headers),
  `pnpm-lock.yaml` + exact-pinned `package.json` (the toolchain).
- Production builds run on **Cloudflare Workers Builds**, triggered by pushes
  to `main` of [padolsey/onesown](https://github.com/padolsey/onesown). The
  build command is `pnpm build`; the deploy command is `npx wrangler deploy`.

## The attestation

Every build emits `/.well-known/deployment.json`
(`scripts/emit-deployment-metadata.mjs`), served from the site root:

- `commit` — the full git SHA the build was made from (from
  `WORKERS_CI_COMMIT_SHA` in Cloudflare's build container)
- `commitUrl`, `repository`, `branch` — links to the exact public source
- `builtAt`, `builder`, `buildId` — when and where the build ran

The same SHA is baked into the app itself as SvelteKit's version
(`/_app/version.json`, and shown at [/verify](https://onesown.app/verify)).

**An attestation file is a claim, not a proof** — a malicious deployment could
serve a lying one. Which is why the next section is the part that matters.

## Independent verification (trust no one)

Builds are deterministic: `kit.version.name` is set to the commit SHA instead
of SvelteKit's default build timestamp, dependency versions are exact-pinned
with a committed lockfile, and CI rebuilds every commit twice and fails on any
byte difference. So you can reproduce the deployment yourself:

```sh
git clone https://github.com/padolsey/onesown
cd onesown
git checkout <commit from /.well-known/deployment.json>
corepack enable
pnpm install --frozen-lockfile
pnpm build
node scripts/verify-deployment.mjs https://onesown.app
```

The script hashes every file your build produced and compares it byte-for-byte
against what the server returns, then cross-checks the served attestation
against `/_app/version.json`. Two files are excluded from the byte comparison,
by design: `deployment.json` itself (it contains the build timestamp; its
`commit` field is cross-checked instead) and `_headers` (parsed by Cloudflare,
never served).

If it prints `VERIFIED`, the site you are being served **is** the public
source at that commit — this is the one guarantee that requires trusting
neither the operator nor the attestation.

Because the verified HTML references its scripts and styles by content-hashed
path, verification covers everything the page can load. Files parked at
unreferenced paths would be unreachable from the verified app.

## What the browser enforces

A Content-Security-Policy is embedded in every page (hash mode, see
`svelte.config.js`) with `default-src 'none'` and `connect-src 'self'`: the
browser itself refuses requests to any other origin — scripts, images, fonts,
fetch/XHR/WebSocket. `static/_headers` adds `frame-ancestors 'none'`,
`nosniff`, `no-referrer`, and a restrictive `Permissions-Policy`.

There is no analytics, no telemetry, no third-party script, no remote font,
and no tracking pixel. The e2e suite (`tests/e2e.mjs`) fails if any request
during a full drive of the app leaves the site's origin — the privacy claim is
a regression test, not a promise.

Your draft is stored in `localStorage` in your browser and is never
transmitted. "Send"/"Post" buttons copy to your clipboard; "Save to disk"
writes a local file.

## The trust model, honestly

Verification is **per-version**: it proves that the deployment you checked, at
the time you checked it, matches the public source. Beyond that, you are
trusting:

- **Cloudflare** — it runs the build, serves the bytes, and terminates TLS. It
  is the named trusted hosting/build party. Cloudflare's platform adds NEL
  (network-error-logging) response headers; these are Cloudflare's, not the
  app's.
- **The operator's future behavior** — a later deploy could differ. History on
  `main` is append-only (force-pushes and deletion are blocked), so every
  attested SHA remains publicly auditable; re-verification is how you'd catch
  a change.
- **Your own machine** — browser extensions and local software are outside
  anything a website can attest to.

And one limitation stated plainly: no web page can honestly claim to be
*mathematically incapable* of tracking you (for example, CSP cannot prevent
navigation-based exfiltration). The claim here is narrower and checkable: the
served code is the public code, it makes no outbound requests, and the browser
is instructed to refuse any it might try to make.

## Operating policy

- Production deploys **only** via Cloudflare Workers Builds from `main`. This
  is policy, not a technical impossibility — the account owner could run
  `wrangler deploy` manually. A manual deploy of unpublished code would be
  detectable by the verification procedure above (and by CI's reproducibility
  check against the attested commit).
- Cloudflare zone settings that rewrite responses (Rocket Loader, email
  obfuscation, Cloudflare Web Analytics/RUM injection) must stay **off** —
  any of them would break byte-for-byte verification, which is exactly how
  you'd notice.
- **Emergency procedure:** if a bad deploy ships, roll back in the Cloudflare
  dashboard to the previous Worker version (or revert the commit and let
  Workers Builds redeploy). If a manual `pnpm deploy` is ever unavoidable, it
  must deploy a commit that is already pushed to `main`, and the incident gets
  documented in the repository.

## CI

`.github/workflows/ci.yml` runs on every push and pull request:
`pnpm install --frozen-lockfile`, type-checking, unit tests, a production
build, a schema check on the generated `deployment.json`, and a double-build
byte-for-byte reproducibility check.

Dependency hygiene is described in the README: exact pins, committed lockfile,
pnpm `minimumReleaseAge` of 3 days, and no dependency lifecycle scripts.

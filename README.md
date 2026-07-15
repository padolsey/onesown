# A Room of One's Own

**https://onesown.app** — one draft, seven rooms. A notepad that swaps the app
around your words.

What you write is shaped by what you write *into*. This is a single plain-text
draft you can move between seven "rooms" — a quiet page, a scratch file, a
legal pad, a terminal buffer, an unsent email, an office document, and a
280-character box — and notice what each one does to your voice. Every room
keeps its own lighting.

Nothing you write leaves the page. The draft autosaves to the browser's local
storage; **Save to disk** (⌘S / Ctrl+S) writes a plain `.txt` file via the File
System Access API, or downloads one where that isn't available.

## How it works

- **One canonical draft** (`src/lib/state.svelte.ts`) — a single string plus a
  little mail-header state, persisted to `localStorage`, edited through
  whichever room is active.
- **Rooms** (`src/lib/shells/`) are pure chrome around one of two editors: a
  plain auto-growing `<textarea>` (`Editor.svelte`) or a `contenteditable`
  rich editor (`RichEditor.svelte`).
- **Formatting lives in the draft as plain markers** (`**bold**`, `*italic*`,
  `<u>underline</u>`). `src/lib/markers.ts` is the codec: rich rooms render
  markers to HTML and serialize their DOM back. Its invariant — serializer
  output must be a fixed point of the parser — is enforced by the unit tests
  and an E2E idempotence sweep over hostile drafts.

## Develop

```bash
pnpm install
pnpm dev        # vite dev server on :5173
pnpm check      # svelte-check
pnpm test:unit  # marker codec unit tests (node:test, no build step)
pnpm test:e2e   # real-Chromium E2E — needs `pnpm dev` running first
```

The E2E suite (`tests/e2e.mjs`) drives a real Chromium via `playwright-core`:
persistence, room switching, rich-text round-trips, menus, and the
hostile-input idempotence sweep. It looks for a `chrome-headless-shell` under
`~/.cache/ms-playwright`, or set `ONESOWN_E2E_CHROMIUM=/path/to/chromium`.

## Deploy

Deployed as an **assets-only Cloudflare Worker** at https://onesown.app — the
site is fully prerendered (`@sveltejs/adapter-static`), so no server code
ships at all. Production deploys run automatically via **Cloudflare Workers
Builds** on push to `main`; `pnpm deploy` exists for emergencies only (see
[DEPLOYMENT_VERIFICATION.md](DEPLOYMENT_VERIFICATION.md)).

If server routes are ever needed, swap `@sveltejs/adapter-static` for
`@sveltejs/adapter-cloudflare` in `svelte.config.js` and point `wrangler.jsonc`
at the generated worker.

## Verified deployment

The deployment is designed to be **independently verifiable**: builds are
bit-for-bit reproducible, every deploy publishes its commit SHA at
[`/.well-known/deployment.json`](https://onesown.app/.well-known/deployment.json),
and `node scripts/verify-deployment.mjs` proves the served bytes match a local
build of the public source. A strict CSP (browser-enforced) forbids requests
to any other origin, and the e2e suite fails on any cross-origin request.
Human-readable version at [/verify](https://onesown.app/verify); full trust
model in [DEPLOYMENT_VERIFICATION.md](DEPLOYMENT_VERIFICATION.md).

## Supply-chain posture

The published site is static HTML/CSS/JS with **zero runtime dependencies**;
everything in `package.json` is build/test tooling, and it's kept deliberately
boring: SvelteKit, Vite, Tailwind, TypeScript, wrangler, playwright-core.

- All versions are **pinned exactly** (`save-exact=true`) with a committed
  lockfile — upgrades are deliberate, reviewed diffs.
- `pnpm-workspace.yaml` sets `minimumReleaseAge: 4320` — package versions
  younger than 3 days are refused, so a compromised release has time to be
  caught and yanked before it can land here.
- No dependency may run lifecycle/postinstall scripts
  (`onlyBuiltDependencies: []`; pnpm ≥10 blocks them by default anyway).
- The pnpm version itself is pinned via the `packageManager` field (corepack).

## License

[MIT](LICENSE)

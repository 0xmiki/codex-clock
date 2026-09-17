# Codex Watch

A local Codex usage coach and thread dashboard built with SvelteKit and running on Node.js 22+. Ask where your tokens went, spot expensive patterns, and inspect saved thread usage. No Codex Watch account or database. Bun is used for development, builds, and unit tests.

```sh
bun install
bun dev
```

Open the Vite URL printed in the terminal. Requires an installed `codex` executable. Codex Watch inherits `CODEX_HOME`.

## Run the production app

```sh
bun run build
npm start
# Open http://127.0.0.1:4260
```

The package contains a bundled JavaScript server and web assets. End users need Node.js 22+ and an installed, authenticated Codex CLI. No Bun installation or build step is needed to run the package.

## Usage coach

The coach uses an ephemeral, read-only Codex app-server thread and receives a compact snapshot of the 30 highest-usage threads updated today. It remembers follow-up questions while Codex Watch is running, cannot call tools, and does not appear in saved thread history. Its own model turns consume Codex usage.

## Saved thread stats

Project pills filter the newest 100 non-archived threads. They start in most-recently-active order and keep that order while the page stays open.

Each full-width row uses the saved thread title returned by Codex, then Codex's generated `thread_name`, then the first 48 characters of the thread prompt preview. Threads without any of those are labeled `Untitled thread`.

Each row graphs recent requests, cached and uncached input, output, and latest context use. Cached input is part of input; reasoning output is part of output, not an extra token charge. Missing counters remain unknown, never zero.

On initial load and manual Refresh, Codex Watch starts a short-lived `codex app-server --stdio`, requests `thread/list`, reads generated names from `session_index.jsonl`, and reads token counters from the saved rollout paths returned by Codex. The latest valid `total_token_usage` snapshot replaces earlier snapshots. Repeated snapshots are not summed. Files stream line by line; incomplete JSON lines are skipped. Changed files are reread; unchanged counters are cached in memory.

On refresh, Codex Watch also requests account/rateLimits/read through the signed-in Codex client. The compact allowance widget shows remaining percentages and reset times for the account's primary and secondary windows. Codex contacts OpenAI for this lookup. Missing limits show as unavailable without blocking saved thread statistics. Reset times that have passed require a refresh. Project filters do not affect account allowance.

There is no live-thread discovery, automatic data polling, or thread mutation. Saved rollouts are a Codex implementation detail and may change with future versions; the format was checked against local Codex 0.154.0 data.

## npm / npx

```sh
bun run build
npm pack
npx --yes --package ./codex-clock-0.1.0.tgz codex-clock
```

The same JavaScript package can be installed across operating systems and CPU architectures; it contains no native runtime or production dependencies. Local verification was performed on Linux; other platforms still need runtime testing. The package is published on npm as `codex-clock`.

Flags: `--port 4260`, `--codex <executable>`, `--help`. The web server binds only to `127.0.0.1`. The browser cannot supply file paths or invoke arbitrary RPC methods.

```sh
bun test
bun run check
node scripts/smoke-npm.mjs
```

Tests cover saved cumulative counters, partial writes, cache refresh, missing/invalid data, UTC day boundaries, and the stdio protocol using invented data. No model requests are made.

The npm smoke test packs and installs the app into a temporary directory, runs it under Node without Bun on PATH, and checks assets, HTTP protections, missing-Codex handling, and shutdown. Add `--live` to also read dashboard data through your installed Codex CLI; it does not ask the coach a question.

## Releases

Publishing a GitHub Release triggers `.github/workflows/publish.yml`. It checks the version, runs tests and type checks, builds the app, tests a clean npm installation, and publishes with npm provenance. A tag push alone does not publish. Manual workflow runs test the pipeline without publishing.

Configure npm trusted publishing for `codex-clock`: GitHub owner `0xmiki`, repository `codex-clock`, workflow filename `publish.yml`, no environment. Allow direct publishing. No npm token secret is needed.

For the next stable release:

```sh
npm version patch -m "chore: release %s"
git push origin main --follow-tags
gh release create v0.1.1 --verify-tag --generate-notes --title v0.1.1
```

Use the new version printed by `npm version` in the release command. The release tag must equal `v` plus the version in `package.json`. Version `0.1.0` is already published and cannot be published again. Prerelease versions must also be marked as prereleases on GitHub; they publish to npm's `next` tag instead of `latest`.

# MyLimits

A local Codex usage coach and thread dashboard built with Bun and SvelteKit. Ask where your tokens went, spot expensive patterns, and inspect saved thread usage. No MyLimits account or database.

```sh
bun install
bun dev
```

Open the Vite URL printed in the terminal. Requires an installed `codex` executable. MyLimits inherits `CODEX_HOME`.

## Run the binary

```sh
bun run build
./dist/mylimits
# Open http://127.0.0.1:4260
```

The binary embeds Bun and all web assets. It runs outside this repository without Bun, Node, or `node_modules`; Codex must still be installed.

## Usage coach

The coach uses an ephemeral, read-only Codex app-server thread and receives a compact snapshot of the 30 highest-usage threads updated today. It remembers follow-up questions while MyLimits is running, cannot call tools, and does not appear in saved thread history. Its own model turns consume Codex usage.

## Saved thread stats

Project pills filter the newest 100 non-archived threads. They start in most-recently-active order and keep that order while the page stays open.

Each full-width row uses the saved thread title returned by Codex, then Codex's generated `thread_name`, then the first 48 characters of the thread prompt preview. Threads without any of those are labeled `Untitled thread`.

Each row graphs recent requests, cached and uncached input, output, and latest context use. Cached input is part of input; reasoning output is part of output, not an extra token charge. Missing counters remain unknown, never zero.

On initial load and manual Refresh, MyLimits starts a short-lived `codex app-server --stdio`, requests `thread/list`, reads generated names from `session_index.jsonl`, and reads token counters from the saved rollout paths returned by Codex. The latest valid `total_token_usage` snapshot replaces earlier snapshots. Repeated snapshots are not summed. Files stream line by line; incomplete JSON lines are skipped. Changed files are reread; unchanged counters are cached in memory.

On refresh, MyLimits also requests account/rateLimits/read through the signed-in Codex client. The compact allowance widget shows remaining percentages and reset times for the account's primary and secondary windows. Codex contacts OpenAI for this lookup. Missing limits show as unavailable without blocking saved thread statistics. Reset times that have passed require a refresh. Project filters do not affect account allowance.

There is no live-thread discovery, automatic data polling, or thread mutation. Saved rollouts are a Codex implementation detail and may change with future versions; the format was checked against local Codex 0.154.0 data.

## npm / npx

```sh
bun run build
npm pack
npx --yes --package ./mylimits-0.1.0.tgz mylimits
```

This MVP package contains a native binary for the build machine's OS and architecture. `prepack` records those constraints so npm rejects incompatible machines. The tested build is Linux x64. Multi-platform npm distribution is deferred. End users need Node/npm and Codex, but not Bun. Nothing has been published, and the registry name has not been reserved or verified.

Flags: `--port 4260`, `--codex <executable>`, `--help`. The web server binds only to `127.0.0.1`. The browser cannot supply file paths or invoke arbitrary RPC methods.

```sh
bun test
bun run check
```

Tests cover saved cumulative counters, partial writes, cache refresh, missing/invalid data, UTC day boundaries, and the stdio protocol using invented data. No model requests are made.

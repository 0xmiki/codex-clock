# MyLimits

A local Codex dashboard built with Bun and SvelteKit. Compare saved thread usage, token composition, context pressure, and recent request shape. No MyLimits account or database.

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

## Saved thread stats

Today selects threads whose latest saved update falls on the current UTC date. Recent threads shows the newest 100 non-archived threads. Search matches title, project, model, or thread ID.

Each full-width row uses the saved thread title returned by Codex, then Codex's generated `thread_name`, then the first 48 characters of the thread prompt preview. Threads without any of those are labeled `Untitled thread`.

The left side shows whole-thread totals, turns, model calls, and cache share. The middle graph separates cached input, uncached input, and output. The right side compares the latest request with the model context window and graphs up to 12 recent saved model calls. Cached input is part of input; reasoning output is part of output, not an extra token charge. Expand the details for exact counts and paths. Missing counters remain unknown, never zero.

On initial load and manual Refresh, MyLimits starts a short-lived `codex app-server --stdio`, requests `thread/list`, reads generated names from `session_index.jsonl`, and reads token counters from the saved rollout paths returned by Codex. The latest valid `total_token_usage` snapshot replaces earlier snapshots. Repeated snapshots are not summed. Files stream line by line; incomplete JSON lines are skipped. Changed files are reread; unchanged counters are cached in memory.

There is no live-thread discovery, status subscription, account usage/limits request, automatic data polling, or thread mutation. The server process closes after each read. Account limits/history and the previous `--connect` / `--socket` options have been removed. No dollar estimates are calculated. Saved rollouts are a Codex implementation detail and may change with future versions; the format was checked against local Codex 0.154.0 data.

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

<p align="center">
  <img src="https://raw.githubusercontent.com/0xmiki/codex-clock/main/static/codex-watch.svg" width="72" height="72" alt="Codex Clock logo" />
</p>

<h1 align="center">Codex Clock</h1>

<p align="center">
  See how much Codex allowance remains, where your tokens went, and which threads cost more to run.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/codex-clock"><img src="https://img.shields.io/npm/v/codex-clock" alt="npm version" /></a>
  <a href="https://github.com/0xmiki/codex-clock/actions/workflows/publish.yml"><img src="https://github.com/0xmiki/codex-clock/actions/workflows/publish.yml/badge.svg" alt="Release workflow" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-22%2B-417e38" alt="Requires Node.js 22 or newer" /></a>
</p>

<p align="center">
  <a href="#get-started">Get started</a> ·
  <a href="#what-you-can-see">Features</a> ·
  <a href="#how-the-numbers-work">How it works</a> ·
  <a href="#develop">Develop</a> ·
  <a href="https://github.com/0xmiki/codex-clock/issues">Report a bug</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/0xmiki/codex-clock/main/docs/dashboard.svg" width="1600" alt="Codex Clock dashboard showing allowance, daily usage, charts, and threads across sample projects." />
</p>

Codex Clock is a local browser dashboard for your saved Codex threads. It reads usage from your machine and checks allowance through your signed-in Codex CLI. There is no separate Codex Clock account or hosted database.

## Get started

You need **Node.js 22+** and an installed, authenticated [Codex CLI](https://developers.openai.com/codex/cli). Git is needed for the productivity chart.

```sh
npx codex-clock@latest
```

The dashboard opens in your default browser automatically. If no browser is available, open [http://127.0.0.1:4260](http://127.0.0.1:4260) yourself. Click **Refresh** to read the latest saved usage and account allowance.

Prefer an installed command?

```sh
npm install -g codex-clock
codex-clock
```

End users do not need Bun, a source checkout, or a build step. The npm package contains the JavaScript server and web assets, with no bundled runtime or production dependencies.

## What you can see

| View | What it tells you |
| --- | --- |
| Account allowance | Remaining weekly and 5-hour allowance when Codex returns those windows. The weekly bar changes color as allowance falls. Hover for reset and last-check times. |
| Today | Tokens recorded today, with a comparison to your usual usage by the same time of day when enough history is available. |
| Recent days | Daily token totals and the projects that account for today's usage. |
| Thread details | Input, cached input, output, recent requests, model breakdowns, and the latest recorded context usage. |
| Usage Score | How a thread's recent estimated cost per call compares with other threads on the same model. Recorded Fast mode settings contribute to the estimate. |
| Productivity | A rough activity measure that combines daily token usage with committed Git changes. It does not measure code quality. |
| Ask coach | An explanation of your usage patterns, with follow-up questions and support for inspecting a selected thread. |

Choose a project to narrow the dashboard. Account allowance always covers the whole account.

## How the numbers work

**Allowance comes from Codex.** The account widget uses the signed-in CLI's rate-limit response. It is separate from the token totals and cost estimates. If a reset time has passed, refresh to get the current allowance.

**Daily totals use timestamped changes.** Reopening an old thread does not move its lifetime usage into today. Counts include context sent again on later calls. Cached input is part of input, and reasoning output is part of output, so neither gets counted twice. Daily boundaries use UTC.

**Cost is an estimate.** API-equivalent costs are not a subscription bill or an exact measure of allowance consumed. Usage Scores use the last five calls on the current model and need at least five eligible peer threads. A low grade means higher estimated cost per call relative to those peers, not proof that the work was wasteful.

**Fast mode needs recorded evidence.** The score and coach use saved service-tier settings when available. Those settings describe the requested tier, not confirmed billing. Missing evidence stays unknown. Lifetime API-equivalent totals use standard pricing and exclude tier premiums.

<details>
<summary>History coverage and other limits</summary>

- The dashboard indexes all non-archived threads returned by Codex. Summaries cover the full index; the table shows 50 threads per page. This is not a complete account usage ledger.
- Startup shows the last saved dashboard while refreshing in the background. On the first run, threads appear page by page and comparisons stay unavailable until discovery finishes. Allowance and Git productivity do not block usage results.
- The first scan reads saved logs with bounded concurrency. Later scans reuse counters and read appended records. The local cache includes counters, thread titles, file paths, and the last dashboard snapshot—not full transcripts. It lives in `$XDG_CACHE_HOME/codex-clock/usage-v1` (or `~/.cache/codex-clock/usage-v1`) and can be deleted while the app is stopped to force a rebuild.
- Missing or unreadable counters stay unknown. Partial history can hide comparisons rather than produce a misleading percentage.
- Refresh reads saved state. The app does not poll automatically or track active turns in real time.
- Saved rollout formats can change between Codex versions. The parser was checked against local Codex 0.154.0 data.
- The package has been tested on Linux with Node 22 and 24. macOS and Windows still need runtime testing.

</details>

## Local data and the coach

The server listens only on `127.0.0.1`. It reads saved thread metadata, token counters, and local Git history. Refreshing account allowance contacts OpenAI through Codex.

The optional coach also uses Codex and **consumes your Codex usage**. It receives a compact snapshot of up to 30 threads with the most recorded usage today. When you ask about a selected thread, it can also receive the tail of that thread's transcript.

Coach conversations are ephemeral and use a read-only sandbox. The coach is instructed not to call tools, and the app rejects approval requests. The dashboard does not modify your saved threads.

## Command-line options

```sh
codex-clock --port 4300
codex-clock --codex /path/to/codex
codex-clock --no-open
codex-clock --help
```

| Option | Default | Purpose |
| --- | --- | --- |
| `--port` | `4260` | Choose the local HTTP port. |
| `--codex` | `codex` on `PATH` | Use a specific Codex executable. |
| `--help` | | Print usage and exit. |
| `--no-open` | | Start without opening a browser, for SSH or headless sessions. |

The app inherits `CODEX_HOME` if you use a custom Codex data directory.

## Update

For a fresh run of the latest published version:

```sh
npx codex-clock@latest
```

For a global installation:

```sh
npm install -g codex-clock@latest
```

Restart the running dashboard after updating. Existing installations do not update themselves.

## Develop

Development uses Bun and SvelteKit. The published app runs on Node.

```sh
git clone https://github.com/0xmiki/codex-clock.git
cd codex-clock
bun install --frozen-lockfile
bun dev
```

Open the Vite URL printed in the terminal. Codex must be installed and signed in to load your real usage.

```sh
bun test                    # Usage accounting and scoring tests
bun run check               # Svelte and TypeScript checks
bun run build               # Build the Node server and web assets
npm start                   # Run the production app
node scripts/smoke-npm.mjs   # Pack, install, and test with Node
```

The smoke test runs a clean installation outside the repository with Bun absent from `PATH`. It checks assets, HTTP protections, missing-Codex handling, and shutdown. Add `--live` to read through your installed Codex CLI as well. These tests do not ask the coach a question.

## Releases

Publishing a GitHub Release runs the [release workflow](https://github.com/0xmiki/codex-clock/blob/main/.github/workflows/publish.yml). It checks the version, runs tests, builds the app, tests the npm package, and publishes using npm trusted publishing with provenance. The same README appears on GitHub and ships in the npm package.

```sh
npm version patch -m "chore: release %s"
git push origin main --follow-tags
# Replace vX.Y.Z with the version printed above.
gh release create vX.Y.Z --verify-tag --generate-notes --title vX.Y.Z
```

The release tag must match `v` plus the version in `package.json`. Pushing a tag alone does not publish. GitHub prereleases must use a prerelease version and publish to npm's `next` tag. A manual workflow run checks the build without publishing.

## Bugs and contributions

[Open an issue](https://github.com/0xmiki/codex-clock/issues) with your OS, Node and Codex versions, and steps to reproduce the problem. Remove private prompts, thread titles, paths, and credentials before sharing logs or screenshots.

For code changes, run the checks above and use commit prefixes such as `feat:`, `fix:`, or `docs:`.

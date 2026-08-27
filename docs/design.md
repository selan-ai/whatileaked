# whatileaked — design

A CLI that scans local coding-agent transcripts for credentials and reports how
many were transmitted to a model provider. Open source, run with `npx`, no
network, no telemetry, read-only.

It exists to make an invisible problem countable: gitleaks scans your repo,
nothing scans `~/.claude`. Every secret in a transcript was uploaded.

## Scope

**v1 does one thing:** discover transcripts, scan them, print findings grouped
by rule with the session and project each came from.

Explicitly out of v1:

- `--clean` (rewriting local transcripts). Destructive, and unproven rules
  should be beaten on by strangers before they edit anyone's history.
- Flags of any kind. The command takes no arguments.
- Any network call, including version checks.
- Any file write. stdout only.

## Claim discipline

Selan redacts in flight, so with Selan those secrets would still sit in the
local `.jsonl`. What changes is that none of them reach the provider. The
output says *transmitted*, never *stored*, and the README says the same. The
narrower claim survives a hostile reader; the broad one does not.

## Prior art, and why not "agentleaks"

Three projects already hold that name: `Privatris/AgentLeak` (IEEE-paper
benchmark for multi-agent privacy leakage), `yagobski/agentleak` (runtime
execution-trace auditing), and `Thomas-E-Lewis/agentleaks`. All scan agent
*frameworks* at runtime — CrewAI, LangChain, AutoGen. None reads the transcript
files a coding agent already wrote to your disk, which is the whole of what this
does.

Different problem, but the name would have lost anyway: a forum reader sees
"agentleaks" and thinks of the one with the paper behind it. `whatileaked` says
the thing is about your own machine, and `npx whatileaked` is the pitch in one
command.

## Disclosure

whatileaked is built by Selan (selan.ai), and Selan sells the thing that fixes
what it finds. That is stated plainly in the README's opening and in one line
under the CLI output:

```
Built by Selan (selan.ai) — we make a proxy that redacts these before they leave
your machine. This tool sends nothing anywhere; read scan/scanner.ts.
```

One line, disclosed first rather than discovered later. A commercial tool that
volunteers its own conflict of interest gets argued with on the merits; one
caught hiding it gets dismissed on the spot, and the thread is the whole point
of the project.

The disclosure is a constant in `report/disclosure.ts`, so it is one edit and
one snapshot test rather than a string scattered through the reporter.

## Layout

```
src/
  cli.ts                     entry; calls main(), maps errors to exit codes
  main.ts                    composition root — every collaborator built here
  sources/
    source.ts                Source interface + SourceName enum
    claude-code-source.ts    ~/.claude/projects/**/*.jsonl
    codex-source.ts          ~/.codex/sessions/**/*.jsonl
    home.ts                  resolves $HOME once, injected
  transcript/
    entry.ts                 zod schemas for one jsonl line, per source
    reader.ts                file -> AsyncIterable<TranscriptEntry>
    text.ts                  entry -> the strings worth scanning
  scan/
    secret-rules.ts          GENERATED from gitleaks — do not edit
    keyword-index.ts         one combined prefilter pass over the rule set
    entropy.ts               Shannon entropy of a string
    fingerprint.ts           sha256(secret) truncated to 12 hex
    scanner.ts               Scanner.scan(text) -> Match[]
  report/
    reporter.ts              Reporter interface
    terminal-reporter.ts
    aggregate.ts             Finding[] -> per-rule totals and distinct counts
scripts/
  generate-secret-rules.ts   fetches gitleaks.toml, emits secret-rules.ts
```

Files are small and named for what they do. There is no `utils/` — a helper
lives in a file named after its job (`entropy.ts`, `fingerprint.ts`), because a
junk drawer is where cohesion goes to die.

## Types

`Match` is what the scanner returns for one string. `Finding` is a match plus
where it was found. The reporter aggregates; the scanner never counts.

```ts
export const sourceNameSchema = z.enum(['claude-code', 'codex'])
export type SourceName = z.infer<typeof sourceNameSchema>
export const SourceName = sourceNameSchema.enum

export interface Match {
  rule: string
  fingerprint: string
}

export interface Finding {
  rule: string
  fingerprint: string
  source: SourceName
  project: string
  sessionId: string
  file: string
  entryIndex: number
}
```

No field on either type can carry the secret. Not the value, not a prefix, not
a four-character preview — this is the object that gets printed and pasted into
a public forum thread.

Every parameter is required. Absence is stated in the type (`gitBranch: string
| null`), never elided with `?`.

## Interfaces

```ts
export interface Source {
  readonly name: SourceName
  discover(): AsyncIterable<TranscriptFile>
}

export interface Reporter {
  report(findings: readonly Finding[], scanned: ScanStats): void
}
```

`main.ts` holds the source array and the reporter. Adding Cursor is one class
and one array entry; adding JSON output is one class. Nothing constructs its
own dependencies and nothing reads a singleton.

## Transcript parsing

Both agents write jsonl, one entry per line, both carrying a session id and a
working directory:

- **Claude Code** — `~/.claude/projects/<slug>/<sessionId>.jsonl`. Entries have
  `sessionId`, `cwd`, `type`, `message`.
- **Codex** — `~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<id>.jsonl`. The first
  line is `type: "session_meta"` carrying `payload.id` and `payload.cwd`;
  the rest are `response_item` / `event_msg`.

Each source owns its own zod schema and normalises to a common
`TranscriptEntry`. Parsing is `safeParse` per line: an unrecognised line is
skipped and counted, never thrown on. These formats change without notice and a
scanner that dies on an unknown line is a scanner nobody runs twice.

`text.ts` flattens an entry to the strings worth scanning — message content,
tool inputs, tool results — so the scanner never learns what a transcript is.

## Scanner

Modelled on Selan's own request-path scanner, minus everything read-only mode does not
need: no redaction, no failure mode, no resume, no worker pool.

Kept, because each earns its place:

- **Keyword prefilter as one combined alternation.** Asking 219 rules
  individually is ~220 passes over the text; one pass answers for all of them.
- **A linear-time engine, not `RegExp`.** Gitleaks patterns are written for
  Go's RE2, so they use no backreferences or lookaround and compile verbatim on
  any RE2-class engine. See the engine note below for which one and why.
- **Entropy gate.** `[a-z0-9]{32}` matches a checksum as readily as a key.
- **Upstream allowlists.** Omitting them flags AWS's own published example key.
- **Base64 sweep.** Encoded blobs are everywhere in agent payloads and hide a
  credential from every rule above.

Rules are generated, with the gitleaks source URL and its MIT notice in the
header. A rule fix is a re-run of the generator, not an edit.

Single-threaded in v1. If a full sweep is slow enough to notice, a worker pool
is a later change behind the same `Scanner` interface.

## Output

```
whatileaked — 1,204 transcripts, 2 sources

  aws-access-token         7   (3 distinct)
    billing-api    0a3f8c21…  entry 412
    dcp            7b1e9d04…  entry 88
  github-pat              11   (1 distinct)
    deploy-tool      c40a1f77…  entry 19

20 credentials transmitted to Anthropic and OpenAI.
```

`project` is the transcript's `cwd` basename, not the full path — enough to
find it, short enough to read. Real names still print, which is the known cost
of shipping no flags; `--anonymize` is the later fix.

The disclosure line sits under the results — see below.

## Testing

Jest, unit tests beside the code, one concern per test.

- **`scan/`** — a case per rule class (aws, github, anthropic, openai, generic
  high-entropy), plus the negatives that matter: an allowlisted example key, a
  low-entropy checksum, a base64 blob with a key inside it. Fingerprints are
  asserted stable across runs, and asserted absent from every output string.
- **`transcript/`** — real-shaped fixture lines per source, plus a truncated
  line, an unknown `type`, and invalid JSON. All three are skipped and counted.
- **`sources/`** — discovery against a temp directory tree, `$HOME` injected.
- **`report/`** — aggregation counts (total vs distinct fingerprints) and a
  snapshot of the rendered report.

**Fixture secrets are generated at test time from a fixed seed, not committed.**
Committing strings that trip 219 credential rules means GitHub's own secret
scanning opens alerts on the repo, and it makes the project look like exactly
the thing it warns about.

## Why not the native `re2`

The obvious engine for gitleaks patterns is the native `re2` package. This
project cannot use it, and the reason is the distribution strategy rather than
anything about matching.

`re2` is a native addon whose `.node` binary is fetched by a postinstall
script. Recent npm blocks install scripts by default, and with them blocked
`re2` fails to load outright — verified: `npm i --ignore-scripts re2` then
requiring it throws `Cannot find module './build/Release/re2.node'`. A tool
whose entire distribution is `npx whatileaked` cannot have an install step that
a default npm setting breaks.

That ruled out native engines and pointed at WebAssembly, then at JavaScript's
own engine — see below for how that went.

## The engine changed, and that is the whole performance story

This was designed around `rregex` — the Rust regex crate in WebAssembly —
because gitleaks patterns target Go's RE2 and run there verbatim. That turned
out to be the wrong choice, for a reason that only shows up at scale.

A wasm32 module has 4GB of address space, never releases it, and compiling all
219 gitleaks patterns costs **1874MB before a byte is scanned** — roughly 8.5MB
per pattern, spread evenly rather than concentrated in a few. On 710MB of real
transcripts that hit the ceiling two thirds through, after which every
remaining entry failed.

Things tried, measured on the same corpus:

| | Peak | Time |
|---|---|---|
| rregex, patterns rebuilt every 1MB | 2774MB | 68s |
| rregex, rebuilt every 8MB | 1752MB | 38s |
| rregex, never rebuilt, lazy compile | 1581MB | 30s |
| all rules on JavaScript | 1372MB | 32s |
| **JavaScript only, rregex removed** | **346MB** | **17s** |

Rebuilding patterns to discard their caches is *worse*, monotonically: freeing
returns no address space, so each rebuild only raises the high-water mark. That
was tried first and had to be undone.

Translating to JavaScript also let the two patterns that had been altered to
satisfy Rust — a `{50,1000}` clamped to fit its DFA size limit, and an escaped
`{{` — ship exactly as gitleaks wrote them.

Correctness is held by differential testing against the Rust engine, which
stays as a dev dependency: 106,001 comparisons for directly-translatable rules
and 12,775 for folded ones, zero disagreements, plus fixture tests on every
commit. A pattern neither route can translate is dropped by the generator with
its reason recorded, never approximated.

Two things independent of the engine still matter:

- **Input is chunked to 16KB with 1KB of overlap**, so no single match runs over
  a 144KB line. The overlap exceeds the longest secret plus the widest rule
  prefix, so a secret near a boundary is found twice and deduplicated.
- **A rule only ever sees a 512-byte window** around its own keyword hit.

An entry the engine still refuses is counted and reported, never swallowed: a
silent zero would read as "nothing to find" when it means "not looked at".

## Stack

- **Node >=24**, ESM. Node 24 strips TypeScript natively
  (`process.features.typescript === 'strip'`), which is what lets the test setup
  below have no transform step at all.
- **TypeScript 7.0.2** for typechecking only: `tsc --noEmit`.
- **`node --test`, not jest.** `ts-jest`'s peer range is `>=4.3 <7`, so jest and
  TypeScript 7 cannot coexist today. Node's runner plus native type stripping
  removes jest, ts-jest and their transform config in one move — fewer
  dependencies for a tool whose pitch is that it has almost none.
- **tsup** to bundle `dist/cli.js`, **biome** to format and lint, **zod** to
  parse, **rregex** to match. That is the whole dependency list.

`npx whatileaked` must work on a clean machine with no install step and no
native build. Every choice above is downstream of that sentence.

## Comment discipline

Comment why, never what. A comment earns its place by recording a decision or a
mistake already made once — the prefilter's cost, why RE2, why fixtures are not
committed. No file headers, no restating the signature, no section banners.

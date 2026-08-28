# How whatileaked works, and why

This is the reasoning behind the code, not a tour of it. Anything that would go
stale the moment a file moves — file trees, type definitions, signatures — is
deliberately absent. Read the source for those.

## What it is

A CLI that reads local Claude Code and Codex transcripts, matches them against
the gitleaks rule set, and reports which credentials were transmitted to a
model provider. A second command replaces those credentials with a placeholder.

It makes no network request, has no configuration, and has no runtime
dependencies.

## The claim it makes, and the one it does not

Selan redacts credentials in flight. It cannot un-write a transcript, so with
Selan in place those secrets would *still be on disk* — what changes is that
none of them reach the provider.

So the output says **transmitted**, never **stored**. The narrower claim
survives a hostile reader; the broad one does not, and this tool exists to be
posted somewhere hostile readers live.

## A leak that happened, and a leak that recurs

A transcript is a record. Whatever is in it was sent once, and no edit to the
file un-sends it. An instruction file is not a record — it is input, read again
every time the agent starts, so a credential in one is not a past event but a
standing arrangement to keep leaking.

Both are scanned through the same pipeline and printed in the same list. The
path distinguishes them, which is enough: nobody needs to be told that
`CLAUDE.md` is not a transcript.

The summary underneath is where they part. The headline counts only what was
provably transmitted. Global instruction files load into every session and would
qualify, but per-project memory files surface on relevance instead, so a secret
in one may never have been sent — and a tool that exists to survive a hostile
reader cannot round that up to "sent to a model provider". So the credentials
still sitting on disk get their own sentence, which says the thing that is true
of all of them: they will be read again unless someone removes them.

## Nothing may carry a secret

No type in the codebase has a field that can hold a credential value. Not the
value, not a prefix, not a four-character preview. A finding carries a rule
name and a truncated SHA-256.

This is not caution for its own sake. The output is designed to be screenshotted
into a public thread, and a preview of an AWS key's first four characters would
be `AKIA` whether the key is live or invented — all risk, no information.

The one exception is deliberate and narrow: redaction has to know which string
to replace, so the scanner has a single method that returns secret values. It is
called only by `wipe`, the result lives in memory long enough to rewrite one
line, and it is never printed, logged, stored, or handed to a reporter.

What *is* shown is the masked text preceding the secret. `const TEST_KEY = ***`
answers "is this real?" instantly; a fingerprint alone never could.

## Detection

Rules come from gitleaks, unmodified, generated into a source file by a script
that fetches upstream. Three rules are dropped, each with its reason recorded in
the generated file: two fire constantly on ordinary source code, one matches
paths rather than text.

Three things make a full sweep fast enough to be worth running:

- **One combined keyword pass.** Asking ~200 rules individually whether their
  keyword appears meant ~700 separate passes over the text — tens of gigabytes
  of scanning for one machine's history. A single alternation walks it once.
- **Rules only see a window.** A keyword hit says where a candidate is, so a
  rule runs over 512 characters around it rather than over a 144KB line.
- **Input is chunked.** No single match runs over a whole transcript line.

Also kept, because each earns it: an entropy gate, because `[a-z0-9]{32}`
matches a checksum as readily as a key; upstream allowlists, because omitting
them flags AWS's own published example key; and a base64 sweep, because agent
payloads are full of encoded blobs and a secret inside one is invisible to every
rule.

## The engine changed, and that is the whole performance story

This was designed around `rregex` — the Rust regex crate in WebAssembly —
because gitleaks patterns target Go's RE2 and run there verbatim. That was the
wrong choice, for a reason that only appears at scale.

A wasm32 module has 4GB of address space and never releases it, and compiling
all 219 gitleaks patterns costs **1874MB before a byte is scanned** — about
8.5MB per pattern, spread evenly rather than concentrated in a few. On 710MB of
real transcripts that hit the ceiling two thirds through, after which every
remaining entry failed.

Measured on the same corpus:

| | Peak memory | Time |
| --- | --- | --- |
| rregex, patterns rebuilt every 1MB | 2774MB | 68s |
| rregex, rebuilt every 8MB | 1752MB | 38s |
| rregex, never rebuilt, compiled lazily | 1581MB | 30s |
| rules moved to JavaScript | 1372MB | 32s |
| **JavaScript only, rregex removed** | **346MB** | **17s** |

Two things worth taking from that table. Rebuilding patterns to discard their
caches is *worse*, monotonically — freeing returns no address space, so each
rebuild only raises the high-water mark. And the fix that worked was removing a
dependency, not adding one.

## Translating the patterns

gitleaks patterns are Go regexes. Most carry `(?i)` at the very front, which is
exactly JavaScript's `i` flag. Thirty-one scope case-insensitivity to part of
the pattern — a prefix stays case-sensitive while the body does not — which
JavaScript cannot express as a flag. Those get each case-insensitive region
rewritten to be explicitly case-tolerant instead: a character class gains the
opposite-case letters, a literal becomes a two-case class. Same strings matched,
written longer.

A pattern neither route can translate is dropped by the generator with its
reason recorded. It is never approximated — a rule that matched *slightly*
differently would be worse than one that is absent and said so.

Correctness here rests on differential testing against the Rust engine, which
remains a dev dependency for exactly this purpose: 106,001 comparisons for the
flag route and 12,775 for the rewritten one, drawn from real transcripts, with
zero disagreements. Fixture tests check the same property on every commit.

Removing the WASM engine also let two patterns ship as gitleaks wrote them. Both
had been altered to satisfy Rust — one repetition bound clamped to fit a DFA
size limit, one brace escaped — and JavaScript accepts both unmodified.

## Reading transcripts

Both agents write JSONL, one entry per line, each carrying a session id and a
working directory. Each source owns its own shape and normalises to a common
entry.

Parsing is per-line and forgiving: an unrecognised line is skipped and counted,
never thrown on. These formats change without notice, and a scanner that dies on
an unknown line is a scanner nobody runs twice. The same applies to a file that
vanishes mid-scan, which is just an agent writing while this runs.

An entry the engine refuses is counted and reported rather than swallowed. A
silent zero would read as "nothing to find" when it means "not looked at".

## Wiping

Separate from scanning, never reachable from the default command, and it asks
before touching anything. The user types the whole word; a piped or scripted run
cannot answer at all, so `yes | whatileaked wipe` rewrites nothing.

Replacement is textual substitution in the raw line rather than
parse-and-reserialise. Reserialising would reorder keys and restyle the entire
file, turning a one-secret edit into a whole-file rewrite no diff could be read.
Credentials contain no character JSON escapes, so the secret appears in the raw
line exactly as the scanner found it.

A secret inside a base64 blob has no literal substring to replace, so the whole
encoded run is redacted. Missing this once meant `wipe` left behind exactly the
findings `scan` kept reporting — the worst possible outcome for a tool whose job
is removing them, and now covered by a test that scans after wiping and requires
zero findings.

Files are rewritten through a temporary file and a rename, so an interrupted run
leaves the original intact rather than half a transcript.

## Distribution is a design constraint, not an afterthought

The whole distribution strategy is one line: `npx whatileaked scan`. That
sentence ruled out choices upstream of it.

Native addons are out. The obvious engine for these patterns is the native `re2`
package, whose binary arrives via a postinstall script — and recent npm blocks
install scripts by default, which makes it fail to load outright. A tool
distributed by `npx` cannot have an install step that a default setting breaks.

Zero runtime dependencies is a claim on the README rather than an accident, and
it is why the ANSI colour codes are written out by hand rather than pulled from
a package.

## Conventions

Closed sets are declared once. Absence is stated in a type as `| null`, never
elided with an optional. Every throw site has a named error class rather than a
bare `Error`, so callers match on a type rather than on message text.

Collaborators are built in one place and passed in by constructor. Nothing
reaches for a singleton and nothing constructs its own dependencies, which is
what makes the tests able to hand a scan a temporary directory and a string
buffer instead of a home directory and a terminal.

Comments record decisions and mistakes already made once — why an engine was
chosen, why a threshold is what it is — never what the line below already says.

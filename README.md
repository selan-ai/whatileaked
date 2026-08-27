# whatileaked

Your coding agent writes every conversation to disk. gitleaks scans your repo.
Nothing scans `~/.claude`.

```
npx whatileaked
```

No install, no flags, no network, no files written. It reads your local Claude
Code and Codex transcripts, matches them against the gitleaks rule set, and
tells you how many credentials are sitting in there.

```
whatileaked — 1,204 transcripts, 382,910 entries

  aws-access-token           3
    0a3f8c21  billing-api                  38× from entry 412
    7b1e9d04  dcp                           2× from entry 88
    ae7ede07  auth-service                 6× from entry 940
  github-pat                 1
    c40a1f77  deploy-tool                     4× from entry 19

4 credentials transmitted to a model provider.
```

## What it does not do

- **It never prints a secret.** A finding carries a rule name and a truncated
  SHA-256 of the value — enough to tell two leaks apart, useless for recovering
  either. There is no field on any type in this codebase that can hold a secret.
- **It makes no network request.** Not for results, not for a version check.
- **It writes nothing.** stdout only.
- **It does not touch your transcripts.** Deleting the leaks is your call.

## Some of these will be fixtures

A credential-shaped string in a test file is still a credential-shaped string,
and this tool cannot tell the difference — nor can gitleaks, nor can any
scanner that works on text. If you have been writing tests for a secret
scanner, expect to see your own fixtures here.

Two things help you sort real from fake without the tool ever showing you a
value: a fingerprint that appears under several projects is one secret you
actually reused, and the entry number takes you to the exact place it was sent
so you can look. Upstream allowlists already drop the published examples —
AWS's own `AKIAIOSFODNN7EXAMPLE` is not reported.

## What "transmitted" means

These strings were in requests your agent sent to Anthropic or OpenAI. They are
*also* still sitting on your disk, in plaintext, in files no scanner watches.
Rotate them.

## How it works

`gitleaks`' rule definitions, used verbatim — 219 of them, regenerated with
`pnpm gen:secret-rules`. A single compiled alternation of every rule's keywords
finds candidates in one pass, and each rule then runs only over a 512-byte
window around its own hit rather than over a 100KB line. That is the difference
between a seven-minute scan and a one-minute one.

Matching runs on JavaScript's own regex engine, with no native addon, no
WebAssembly and **no runtime dependencies at all** — `npx` fetches one file. That is what lets `npx` work on a
machine where npm blocks install scripts — and it is not where this started.

gitleaks patterns target Go's RE2, so the obvious choice was `rregex`, the Rust
regex crate compiled to WebAssembly, which runs them verbatim. It cost 1.8GB of
WebAssembly address space just to compile the rule set, against a hard 4GB
ceiling that is never released, and a full sweep died two thirds of the way
through. Translating the patterns to JavaScript instead took a 710MB sweep from
38 seconds and 1.8GB to **17 seconds and 346MB**, with byte-identical findings.

Most patterns carry `(?i)` at the very front, which is exactly JavaScript's `i`
flag. The 31 that scope case-insensitivity to part of the pattern —
`p8e-(?i)[a-z0-9]{32}` keeps its prefix case-*sensitive* — get each such region
rewritten to be explicitly case-tolerant instead, so `[a-z0-9]` becomes
`[a-zA-Z0-9]`. Same strings, written longer. A pattern that fits neither route
is dropped by the generator with its reason recorded, never approximated.

`rregex` stays on as a dev dependency, because the translations are checked
against it: 106,001 comparisons for the flag route and 12,775 for the folded
one, drawn from real transcripts, with zero disagreements — plus fixture tests
that run on every commit.

## Disclosure

Built by [Selan](https://selan.ai), and Selan sells a proxy that redacts these
before they leave your machine — so we have an obvious interest in you finding a
big number here.

The scanner is a few hundred lines. Read `src/scan/scanner.ts` and check.

## Contributing

Node 24+ (the test runner reads the TypeScript sources directly via native type
stripping — the published bundle is plain JavaScript and runs on Node 20).

```
pnpm install
pnpm test
pnpm typecheck
pnpm lint
```

## License

MIT. Rule definitions come from [gitleaks](https://github.com/gitleaks/gitleaks),
also MIT.

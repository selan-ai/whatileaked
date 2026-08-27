# whatileaked

Your coding agent saves every conversation to your disk. If you ever pasted an
API key, or asked it to read a `.env` file, that key is sitting in a log file —
and it was uploaded to Anthropic or OpenAI when you sent the message.

Secret scanners point at repositories and CI. You can aim one at `~/.claude`
by hand, but nobody does — it is not a repo, it is not in CI, and it does not
look like a place credentials live. It is.

```
npx whatileaked scan
```

## Commands

| Command | What it does |
| --- | --- |
| `whatileaked` | Shows this list. Does nothing else. |
| `whatileaked scan` | Finds credentials in your transcripts. Read-only. |
| `whatileaked wipe` | Replaces them with a placeholder. Rewrites files, asks first. |

Takes about 20 seconds for a year of history. No flags, no config file.

## What `scan` tells you

```
  scanned 561 transcripts · 196,986 messages

* aws-access-token  2 secrets
    f0b93847  billing-api            sent 25 times
              const SECOND_AWS_KEY = '***
              ~/.claude/projects/-Users-you-code-billing-api/965db026.jsonl
    2bcf6de0  deploy-tool            sent once
              AWS_ACCESS_KEY_ID=***
              ~/.claude/projects/-Users-you-code-deploy-tool/c8dd5ea8.jsonl

* github-pat  1 secret
    c40a1f77  auth-service           sent 4 times
              gh auth login --with-token ***
              ~/.claude/projects/-Users-you-code-auth-service/1254ccd7.jsonl

3 credentials sent to a model provider.
```

Reading a finding, left to right:

- **`aws-access-token`** — which kind of credential. These are
  [gitleaks](https://github.com/gitleaks/gitleaks) rule names, so you can look
  any of them up.
- **`f0b93847`** — a fingerprint, *not* the secret. It is a shortened SHA-256 of
  the value, so the same key shows the same code everywhere it leaked. Two rows
  with the same code are one credential you reused; two different codes are two
  different credentials.
- **`billing-api`** — the project you were working in.
- **`sent 25 times`** — how many messages carried it. A key pasted into a long
  conversation gets re-sent with every following message.
- **`const SECOND_AWS_KEY = '***`** — the text just before it, with the secret
  itself masked. This is how you tell a real credential from a test fixture
  without opening anything.
- The path is the transcript to open if you want to see the full context.

## Is it real, or just a test fixture?

Some findings will be fake — a credential-shaped string in a test file is still
credential-shaped, and no scanner can tell the difference. Three things help:

1. **Read the masked context line.** `const TEST_KEY = ***` is a fixture.
   `AWS_ACCESS_KEY_ID=***` probably is not.
2. **Look for a repeated fingerprint.** The same code under several projects is
   a credential you actually reused.
3. **Open the file.** The path is right there.

Published example keys are already excluded — AWS's own `AKIAIOSFODNN7EXAMPLE`
is never reported.

## What `wipe` does

```
  replacing credentials in your local transcripts with a placeholder

  3 secrets across 2 files

  * billing-api            2 secrets in 2 messages
      ~/.claude/projects/-Users-you-code-billing-api/965db026.jsonl
  * auth-service           1 secret in 1 message
      ~/.claude/projects/-Users-you-code-auth-service/1254ccd7.jsonl

  Every secret above will be replaced with a placeholder.
  This rewrites the files and cannot be undone.

  It does not un-send anything — all of these already reached a model
  provider. Rotate them whether or not you wipe.

  Type wipe to rewrite these files, or anything else to stop:
```

It shows you every file first, then waits. You have to type the word `wipe` —
`y` will not do it, and a piped or scripted run cannot answer at all, so
`yes | whatileaked wipe` does nothing.

Each secret becomes `[REDACTED BY whatileaked: aws-access-token]`. Only the
lines holding a secret change; the rest of the file is untouched, and it stays
valid JSON so your agent can still read its own history.

**Wiping does not fix the leak.** The credential already reached a model
provider. Rotate it. Wiping only stops the next person with access to your
laptop from finding it.

## What it will not do

- **It never prints a secret.** Findings carry a rule name and a fingerprint.
  There is no field anywhere in this codebase that can hold a credential value.
- **It never makes a network request.** Not for results, not to check for
  updates. Nothing leaves your machine.
- **It writes nothing** unless you run `wipe`.
- **It has no dependencies.** `npm install` adds one package: this one.

## Where it looks

| Agent | Path |
| --- | --- |
| Claude Code | `~/.claude/projects/**/*.jsonl` |
| Codex | `~/.codex/sessions/**/*.jsonl` |

Adding another agent is one small file — pull requests welcome.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Nothing found |
| `1` | Credentials found |
| `2` | Something went wrong |

So you can use it as a CI gate: `npx whatileaked scan || echo "found something"`.

## Disclosure

Built by [Selan](https://selan.ai), and Selan sells a proxy that redacts these
before they leave your machine — so we have an obvious interest in you finding
a big number here.

The scanner is a few hundred lines with no dependencies. Read
`src/scan/scanner.ts` and check.

## Contributing

Node 24+ to develop (the tests read the TypeScript sources directly). The
published bundle is plain JavaScript and runs on Node 20+.

```
pnpm install
pnpm test
pnpm typecheck
pnpm lint
```

Detection rules come from [gitleaks](https://github.com/gitleaks/gitleaks),
used unmodified. `pnpm gen:secret-rules` regenerates them from upstream.
`docs/design.md` explains how the scanner works and why it is built this way.

## License

MIT. gitleaks rule definitions are MIT too.

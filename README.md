# whatileaked

Your coding agent saves every conversation to your disk. If you ever pasted an
API key into a chat, or asked the agent to read a `.env` file, that key is now
sitting in a log file on your laptop — and it was uploaded to Anthropic or
OpenAI the moment you sent the message.

Secret scanners point at repositories and CI. You can aim one at `~/.claude` by
hand, but nobody does — it is not a repo, it is not in CI, and it does not look
like a place credentials live. It is.

This tool looks there and tells you what it finds.

---

## Install it

You don't. Open a terminal and run:

```sh
npx whatileaked scan
```

`npx` comes with Node.js. It downloads the tool, runs it once, and does not
install anything permanently.

**No Node.js?** Check with `node --version`. If that errors, install Node from
[nodejs.org](https://nodejs.org) (any version 20 or newer) and try again.

If you'd rather keep it around:

```sh
npm install -g whatileaked   # then just: whatileaked scan
```

---

## Run it

There are two commands and no options.

```sh
npx whatileaked scan    # look, and tell you. Changes nothing.
npx whatileaked wipe    # remove what it found. Asks before touching anything.
```

Running `npx whatileaked` with no command just lists them.

A scan takes about 20 seconds for a year of history. It reads files, and that
is all — no network connection is made at any point.

---

## Reading the output

### When it finds nothing

```
  scanned 561 transcripts · 197,016 messages

No credentials found.
```

Nothing to do. This is the good outcome.

### When it finds something

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

Every line, explained:

| Part | Means |
| --- | --- |
| `* aws-access-token` | The kind of credential. These names come from [gitleaks](https://github.com/gitleaks/gitleaks), so you can search any of them. |
| `2 secrets` | How many *different* credentials of that kind. |
| `f0b93847` | A fingerprint — **not** the secret. See below. |
| `billing-api` | The project folder you were working in at the time. |
| `sent 25 times` | How many messages carried it. One paste gets re-sent with every later message in the conversation. |
| `const SECOND_AWS_KEY = '***` | The text right before the secret, with the secret blanked out. This is how you judge it. |
| `~/.claude/projects/…` | The file to open if you want the whole story. |

**What is a fingerprint?** A short one-way hash of the secret. The tool never
prints the credential itself — not even the first few characters — because you
might paste this output somewhere public. The fingerprint is still useful: the
same credential always produces the same code, so two rows sharing a code are
one key you reused in two places, and two different codes are two different
keys.

---

## Is it a real key, or just a test fixture?

Some findings will be fake. A credential-shaped string in a test file is still
credential-shaped, and no scanner can tell them apart. You can:

1. **Read the masked line.** `const TEST_KEY = ***` is a fixture.
   `AWS_ACCESS_KEY_ID=***` probably is not.
2. **Look for a repeated fingerprint.** The same code under several different
   projects is a credential you genuinely reused.
3. **Open the file.** The path is printed for exactly this.

Well-known example keys are already filtered out — AWS's own published
`AKIAIOSFODNN7EXAMPLE` is never reported.

---

## Found something real. Now what?

**Rotate the key first.** Log into AWS, GitHub, wherever it came from, and issue
a new one. This matters more than anything below: the old key has already left
your machine, and deleting your local copy does not call it back.

**Then, if you want, clean your disk:**

```sh
npx whatileaked wipe
```

It shows you every file it would touch, then stops and waits:

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

You must type the full word `wipe`. Pressing `y` does nothing, and a scripted
run cannot answer at all — `yes | whatileaked wipe` changes no files.

Each secret becomes `[REDACTED BY whatileaked: aws-access-token]`. Only the
lines containing a secret change, the rest of the file is untouched, and the
file stays valid so your agent can still read its own history.

---

## When something goes wrong

| What you see | What it means | What to do |
| --- | --- | --- |
| `command not found: npx` | Node.js isn't installed. | Install it from [nodejs.org](https://nodejs.org). |
| `unknown command "..." — expected "scan" or "wipe"` | A typo. | Check the spelling. |
| `scanned 0 transcripts` | No agent history where it looked. | You may not use Claude Code or Codex, or history lives elsewhere. See *Where it looks*. |
| `N messages could not be scanned` | Some entries were unreadable and were skipped. | The count is shown so a partial scan never looks like a clean one. Please [open an issue](https://github.com/selan-ai/whatileaked/issues). |
| `Not confirmed. Nothing was changed.` | `wipe` didn't get the word `wipe`. | Expected. Nothing was touched. |
| It seems stuck | A big history takes ~20 seconds. | Give it a minute before worrying. |

**Exit codes**, if you want to script it:

| Code | Meaning |
| --- | --- |
| `0` | Nothing found |
| `1` | Credentials found |
| `2` | An error |

```sh
npx whatileaked scan || echo "found something"
```

---

## Where it looks

| Agent | Folder |
| --- | --- |
| Claude Code | `~/.claude/projects/` · `~/.claude/CLAUDE.md` |
| Codex | `~/.codex/sessions/` · `~/.codex/AGENTS.md` |
| Cursor | `~/.cursor/projects/*/agent-transcripts/` |

Cursor keeps its older Ask-mode chats in SQLite rather than jsonl, and those are
not scanned. Reading them needs `node:sqlite`, which arrived in Node 22.5, and
this runs on Node 20. Agent transcripts are covered; Ask history is not.

Transcripts record credentials that were already sent. Instruction and memory
files are worse: they are read again at the start of the next session, so a
credential in one keeps leaking until the file is edited. Both are scanned, and
`wipe` rewrites both.

Nowhere else. It does not read your repos, your shell history, or your
environment. Adding support for another agent is one small file — pull requests
welcome.

---

## What it will never do

- **Print a secret.** Findings carry a rule name and a fingerprint. No type in
  this codebase has a field that can hold a credential value.
- **Make a network request.** Not for results, not to check for updates.
  Nothing leaves your machine, ever.
- **Write anything** — unless you run `wipe` and type the word.
- **Pull in dependencies.** Installing it adds exactly one package: this one.

---

## Disclosure

Built by [Selan](https://selan.ai). Selan sells a proxy that redacts these
before they leave your machine, so we have an obvious interest in you finding a
big number here.

The scanner is a few hundred lines with no dependencies. Read
`src/scan/scanner.ts` and check for yourself.

---

## Contributing

Node 24+ to develop (tests read the TypeScript sources directly). The published
build is plain JavaScript and runs on Node 20+.

```sh
pnpm install
pnpm test
pnpm typecheck
pnpm lint
```

Detection rules come from [gitleaks](https://github.com/gitleaks/gitleaks),
used unmodified; `pnpm gen:secret-rules` regenerates them from upstream.
`docs/design.md` covers how the scanner works and why it is built this way.

## License

MIT. gitleaks rule definitions are MIT too.

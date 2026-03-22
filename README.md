# Debug-Driven Skill

This README is for developers who want to understand, install, maintain, or distribute the `debug-driven` skill.

`debug-driven` is an Agent Skills-compatible debugging skill for AI coding agents. It teaches an agent to debug runtime issues with a disciplined loop:

1. Intake the bug report
2. Generate multiple hypotheses
3. Add targeted instrumentation
4. Ask the user to reproduce the issue
5. Analyze logs
6. Apply an evidence-based fix
7. Verify the fix
8. Clean up all debug artifacts

Instead of jumping straight to a guessed fix, the skill pushes the agent to instrument, observe, and only then change code. This makes agent-assisted debugging more disciplined, reproducible, and easier to audit.

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [How It Works](#how-it-works)
- [What The Skill Does / When To Use It](#what-the-skill-does--when-to-use-it)
- [Requirements](#requirements)
- [Developer Notes](#developer-notes)
- [Repository Layout](#repository-layout)
- [License](#license)

## Installation

Install the entire `debug-driven/` directory as a skill folder in your agent's skills location. Keep the directory name as `debug-driven` so it matches the skill frontmatter.

Repository:

```text
https://github.com/rgnicoara/debug-driven.git
```

Clone the repository straight into the appropriate skills location for your host (see sections below).

If you prefer not to use Git, download the repository archive from GitHub and extract the `debug-driven/` folder into your skills directory.

### Codex

Copy the folder to:

```text
$CODEX_HOME/skills/debug-driven
```

That is typically:

```text
~/.codex/skills/debug-driven
```

Example with Git:

```bash
git clone https://github.com/rgnicoara/debug-driven.git ~/.codex/skills/debug-driven
```

### Claude Code

Copy the folder to:

```text
.claude/skills/debug-driven
```

This can be:

- a project-local `.claude/skills/` directory
- or your broader Claude skills location, depending on your setup

Example:

```bash
git clone https://github.com/rgnicoara/debug-driven.git ~/.claude/skills/debug-driven
```

### Generic Agent Skills Host

Any host that supports the Agent Skills open standard can install this skill by placing the `debug-driven` directory into its configured skills directory and loading `SKILL.md` from there.

## Usage

If your host exposes skills through slash commands or named invocations, you can trigger this skill with a prompt such as:

```text
/debug-driven <bug description>
```

Examples:

```text
/debug-driven Checkout total is sometimes doubled after applying a coupon.
/debug-driven The app hangs after login when the profile request returns slowly.
/debug-driven Figure out why this API occasionally returns 500 in production.
```

You can also invoke it in plain language if the host supports automatic skill activation, for example:

```text
Debug this: saving a draft sometimes overwrites the published post.
Figure out why the payment status flips back to pending after refresh.
Something is wrong with the cart subtotal when quantity changes quickly.
```

Providing the following context yields the best results:

- what is happening
- what should happen instead
- how to reproduce it
- any known logs, stack traces, or environment details

## How It Works

At a high level:

- For non-browser apps, the skill tells the agent to write debug output to `./debug-output.log`.
- For browser apps, the skill tells the agent to start the bundled HTTP ingest server and send debug events to it with `fetch()`.
- The agent then reads the resulting log file, reasons about which hypothesis is confirmed, applies a targeted fix, and cleans up all temporary instrumentation.

For browser apps, the bundled HTTP ingest server is started with:

```bash
node scripts/http-log-ingest.js --logFile ./debug-output.log
```

That server writes incoming browser-side debug events to the same log file so the agent can analyze them after reproduction.

The skill also requires cleanup at the end of the session:

- remove debug region blocks
- remove temporary debug helpers
- delete log files
- stop the ingest server if it was started

## What The Skill Does / When To Use It

The skill is designed for:

- Runtime bugs that are not obvious from static inspection alone
- Regressions that need reproduction and evidence
- Issues that need temporary instrumentation before a fix is safe
- Debug sessions where cleanup matters and debug code should not survive

The skill package includes:

- [SKILL.md](./SKILL.md): the main instructions and workflow
- [scripts/http-log-ingest.js](./scripts/http-log-ingest.js): a browser-app log ingest helper for collecting debug logs into a file
- [references/framework-recipes.md](./references/framework-recipes.md): framework-specific instrumentation examples
- [references/cleanup-patterns.md](./references/cleanup-patterns.md): cleanup guidance for removing debug artifacts

Use this skill when investigating a bug, unexpected behavior, or runtime failure where the right fix is not yet proven:

- "Debug this issue"
- "Figure out why this route sometimes returns 500"
- "Something is wrong with the checkout flow"
- "Help me diagnose this flaky runtime error"

Do not use it for:

- Simple syntax errors
- Straightforward compile failures
- Tiny typo fixes where the debugging workflow would be overkill

## Requirements

- An AI coding agent that can read and edit files
- For browser debugging: Node.js, to run [scripts/http-log-ingest.js](./scripts/http-log-ingest.js)
- Ideally, an agent with a blocking question tool for interactive reproduce/verify loops

If the host agent does not have a blocking question tool, the skill supports a plain-text fallback where the same choices are presented in normal conversation and the agent waits for the user's reply.

## Developer Notes

- Keep the whole folder together when installing it. The skill depends on the bundled script and reference files.
- Do not move only `SKILL.md` by itself.
- For browser debugging, use the bundled ingest script instead of inventing a custom one.
- The support files are meant to load on demand, not all at once.
- The skill content in [SKILL.md](./SKILL.md) is the agent-facing instruction set; this README is supplemental documentation for humans maintaining the skill.
- If you change file names or folder names, update the relative links inside [SKILL.md](./SKILL.md).

## Repository Layout

```text
debug-driven/
|-- README.md
|-- SKILL.md
|-- scripts/
|   `-- http-log-ingest.js
`-- references/
    |-- cleanup-patterns.md
    `-- framework-recipes.md
```

## License

MIT

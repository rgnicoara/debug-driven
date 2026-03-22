---
name: debug-driven
description: >
  Activates a structured, hypothesis-driven debugging loop.
  Use this skill whenever the user reports a bug, unexpected behavior, or runtime
  error and wants help diagnosing the root cause — especially for bugs that are
  hard to reproduce or where the fix isn't obvious. Trigger on phrases like:
  "debug this", "figure out why X is happening", "something is wrong with Y",
  "I have a bug", "debug-driven", or any request to investigate a runtime issue
  rather than just apply a code fix. Do NOT use for compile errors with obvious
  fixes or simple typos — only when runtime investigation is needed.
compatibility: >
  Requires a coding agent that can read and edit files. Browser-app debugging
  also requires Node.js to run scripts/http-log-ingest.js. Prefer an agent with
  a blocking question tool; if unavailable, fall back to a plain-text prompt.
---

# Debug-Driven

A structured, hypothesis-driven debugging loop. Instead of immediately
guessing a fix, this skill drives a disciplined hypothesis → instrument → reproduce
→ analyze → fix → verify → cleanup cycle.

---

## Core Philosophy

**Never guess. Instrument, observe, then fix.**

The best debuggers don't immediately patch code. They:
1. Form multiple hypotheses about what could be wrong
2. Instrument the code to test each hypothesis with real runtime data
3. Let the human reproduce the bug (they're in the loop, not the AI)
4. Analyze the evidence and converge on a root cause
5. Apply a targeted fix and ask for confirmation
6. Clean up all instrumentation

This skill enforces that workflow.

---

## Log Output Strategy

All debug instrumentation **logs to a file** (`./debug-output.log` by default) rather than only to stdout/console. This lets the agent read the log file directly after reproduction instead of relying on the user to copy-paste output.

### Non-browser apps (servers, CLI tools, scripts)

Instrumentation writes directly to the log file using the language's native file-append API. No extra server or process needed.

| Language | File-append one-liner |
|---|---|
| JavaScript / TypeScript (Node) | `require('fs').appendFileSync('./debug-output.log', line + '\n')` |
| Python | `open('./debug-output.log', 'a').write(line + '\n')` |
| Go | `f, _ := os.OpenFile("./debug-output.log", os.O_APPEND\|os.O_CREATE\|os.O_WRONLY, 0644); f.WriteString(line + "\n"); f.Close()` |
| Java / Kotlin | `java.nio.file.Files.write(Path.of("./debug-output.log"), (line + "\n").getBytes(), StandardOpenOption.CREATE, StandardOpenOption.APPEND)` |
| C# | `System.IO.File.AppendAllText("./debug-output.log", line + "\n")` |
| Ruby | `File.open('./debug-output.log', 'a') { \|f\| f.puts(line) }` |
| Rust | `use std::fs::OpenOptions; use std::io::Write; let mut f = OpenOptions::new().create(true).append(true).open("./debug-output.log").unwrap(); writeln!(f, "{}", line).unwrap();` |

The file path should be relative to the project root. Use a consistent path across all instrumented files.

### Browser apps (SPAs, PWAs)

Browser code cannot write to the filesystem. Use the HTTP log ingest server bundled with this skill.

**The ingest script lives at [`scripts/http-log-ingest.js`](scripts/http-log-ingest.js) inside this skill's directory.** Resolve the full path from the skill installation location:
- If `CLAUDE_SKILL_DIR` or equivalent is available, use `${CLAUDE_SKILL_DIR}/scripts/http-log-ingest.js`
- Otherwise, find this skill's directory (search for the `debug-driven` skill folder under `.codex/skills/`, `.claude/skills/`, or wherever skills are installed) and reference [`scripts/http-log-ingest.js`](scripts/http-log-ingest.js) inside it

**Do NOT create your own ingest script.** The one bundled with this skill is ready to use.

#### Server launch procedure

**The script self-daemonizes.** Run it as a normal, blocking command — no `&`, no `Start-Process`, no background tricks needed. It forks a detached server process, waits for it to be ready, prints the port, and exits cleanly. The server keeps running after the command returns.

```bash
node <skill-dir>/scripts/http-log-ingest.js --logFile ./debug-output.log
```
Where `<skill-dir>` is the resolved path to this skill's installation directory.

After the command returns (exit code 0), `./debug-ingest.port` and `./debug-ingest.pid` will exist. **Do NOT** use `&`, `Start-Process`, `Start-Job`, REPL tricks, or any other background launch pattern — just run the command normally.

**If the command fails** (exit code 1, permissions error, etc.), ask the user to run the exact same command in a separate terminal. Use the fully resolved path so the user can copy-paste directly. Then wait for `./debug-ingest.port` to appear before continuing.

**Only if the user explicitly declines** to run the server (they say "no", "can't", "skip it", etc.), fall back to `console.log` instrumentation for browser apps. The user will need to paste the relevant console output manually when reproducing. **You MUST NOT choose this fallback on your own** — difficulty launching the server, confidence in a hypothesis, or wanting to "move faster" are not valid reasons to skip the ingest server. Always attempt the server first.

#### After the server is running

The server lets the OS assign a free port (no conflicts), then writes:
- `./debug-ingest.pid` — the server's process ID (for cleanup)
- `./debug-ingest.port` — the assigned port number

**Read the port**, then **instrument with `fetch()`**:
```js
// The agent reads ./debug-ingest.port to get the assigned port, e.g. 52431
fetch('http://localhost:<port>/log', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'H1 | cart.js:44 | subtotal | ' + subtotal })
});
```
Replace `<port>` with the value from `./debug-ingest.port` when writing instrumentation code.

The server writes to `./debug-output.log` (relative to the project root, not the skill directory).

### After reproduction

The agent reads `./debug-output.log` directly to perform log analysis (Phase 4). The user does not need to paste log output — though they may still provide additional context.

---

## Phase 0: Bug Intake

Before doing anything else, gather what you know. Extract from the user's message:

- **Symptom**: What is actually happening?
- **Expected**: What should happen instead?
- **Reproduction steps**: How to trigger it?
- **Stack / environment**: Language, framework, relevant files?
- **Error output**: Any logs, stack traces, error messages already available?

If reproduction steps are missing or unclear, ask. You cannot proceed without them.

---

## Phase 1: Hypothesis Generation

Read the relevant parts of the codebase. Then **generate 3–6 distinct hypotheses** about what could be causing the bug.

Format them as a **bulleted list** using this exact format — `* H1: ...`, `* H2: ...`, etc. Do NOT use numbered lists (`1.`, `2.`). For each hypothesis include:
- A short label (e.g. `* H1: Off-by-one in pagination cursor`)
- A brief explanation of the mechanism
- What evidence would confirm or rule it out

**Rules:**
- Order by plausibility (most likely first)
- Cover structurally distinct failure modes — don't list variations of the same root cause
- At least one hypothesis should cover an assumption you're NOT sure about
- Do not propose a fix yet — this is purely diagnostic
- **Do NOT offer to skip instrumentation.** No matter how confident you are from reading the code, you must instrument and observe runtime evidence before proposing a fix. Code reading produces hypotheses, not conclusions.
- **Do NOT shortcut the logging method.** Use the correct method for the project type (file-append for non-browser, fetch-to-ingest-server for browser). Do not substitute `console.log` to "move faster" or because you're confident — follow the documented flow.

Present the hypotheses to the user and ask if any seem obviously wrong or if there's context that rules them out. Then **immediately proceed to Phase 2** — do not wait for permission, do not ask "what should we do next?", do not offer alternative courses of action.

---

## Phase 2: Instrumentation

Design and inject logging statements that will generate evidence for or against each hypothesis.

### Instrumentation Guidelines

**You MUST use the logging method documented in "Log Output Strategy" for the project type:**
- **Non-browser app** → file-append `_dbg()` helper. No exceptions.
- **Browser app** → `fetch()` to the log ingest server. Start the server first. Do NOT substitute `console.log` because it seems easier or because you're confident in a hypothesis. The only valid reason to use `console.log` is if the user explicitly refused to run the ingest server.

**Log placement strategy:**
- Log at entry/exit of suspicious functions (capture inputs and outputs)
- Log before/after state mutations (capture before and after values)
- Log inside conditional branches (which path is actually taken?)
- Log loop boundaries if loops are involved (how many iterations? what values?)

**Log format** — every log line MUST start with the hypothesis label, followed by location, data label, and value:
```
<Hn> | <file>:<line> | <label> | <value>
```

This lets the agent grep the log file by hypothesis (e.g. all `H2` lines) during analysis. Since all output goes to an isolated log file, no other prefix is needed.

### Wrapping Instrumentation in Region Blocks

**All debug instrumentation MUST be wrapped in `#region DEBUG` / `#endregion DEBUG` blocks.** This makes cleanup reliable — entire regions can be found and deleted as units.

Use the appropriate region markers for each language:

| Language | Start marker | End marker |
|---|---|---|
| JavaScript / TypeScript | `// #region DEBUG` | `// #endregion DEBUG` |
| Python | `# region DEBUG` | `# endregion DEBUG` |
| C# | `#region DEBUG` | `#endregion DEBUG` |
| Java / Kotlin | `// region DEBUG` | `// endregion DEBUG` |
| Go / Rust | `// region DEBUG` | `// endregion DEBUG` |
| Ruby | `# region DEBUG` | `# endregion DEBUG` |

**Rules:**
- Every piece of debug code (log statements, debug-only imports, temporary variables) goes inside a region block
- Multiple region blocks per file are fine — group by hypothesis
- Never put non-debug production code inside a region block
- The region comment is the outer wrapper; log lines and helpers go inside

### Examples by Language

All examples log to a file. See **Log Output Strategy** above for the file-append pattern per language.

**JavaScript/TypeScript (Node):**
```js
// #region DEBUG
const fs = require('fs');
const _dbg = (msg) => fs.appendFileSync('./debug-output.log', msg + '\n');
// Testing H1: token not persisted
_dbg('H1 | auth.js:42 | token_received | ' + JSON.stringify(token));
_dbg('H1 | cart.js:88 | discount_applied | ' + JSON.stringify({ original: price, discount, final: price - discount }));
// #endregion DEBUG
```

**Python:**
```python
# region DEBUG
# Testing H2: charge amount miscalculated
import json
_dbg = lambda msg: open('./debug-output.log', 'a').write(msg + '\n')
_dbg(f"H2 | payments.py:55 | charge_amount | {amount!r}")
_dbg(f"H2 | api.py:112 | response_body | {json.dumps(data)}")
# endregion DEBUG
```

**Go:**
```go
// region DEBUG
// Testing H3: cursor offset
func _dbg(msg string) {
    f, _ := os.OpenFile("./debug-output.log", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
    defer f.Close()
    f.WriteString(msg + "\n")
}
_dbg(fmt.Sprintf("H3 | handler.go:67 | page_cursor | %v", cursor))
// endregion DEBUG
```

**Java/Kotlin:**
```java
// region DEBUG
// Testing H1: coupon validation
java.nio.file.Files.write(java.nio.file.Path.of("./debug-output.log"),
    ("H1 | OrderService.java:91 | coupon_check | " + coupon + " | valid=" + isValid + "\n").getBytes(),
    java.nio.file.StandardOpenOption.CREATE, java.nio.file.StandardOpenOption.APPEND);
// endregion DEBUG
```

**C#:**
```csharp
#region DEBUG
// Testing H2: amount calculation
System.IO.File.AppendAllText("./debug-output.log",
    $"H2 | PaymentController.cs:44 | amount_before_discount | {amount}\n");
#endregion DEBUG
```

**Browser apps (using log ingest server):**
```js
// #region DEBUG
// Testing H2: discount not applied to subtotal
// Port read from ./debug-ingest.port at instrumentation time
fetch('http://localhost:<port>/log', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    lines: [
      'H2 | cart.js:44 | subtotal_before | ' + subtotal,
      'H2 | cart.js:48 | discount_rate | ' + rate,
      'H2 | cart.js:52 | subtotal_after | ' + result
    ]
  })
});
// #endregion DEBUG
```

### Scoping Instrumentation

- Add only what's needed to test your hypotheses — don't spam logs everywhere
- If you have 4 hypotheses, group logs by which hypothesis they test
- Wrap each group in its own region block labeled by hypothesis:
  ```js
  // #region DEBUG
  const fs = require('fs');
  const _dbg = (msg) => fs.appendFileSync('./debug-output.log', msg + '\n');
  // Testing H2: discount not applied to subtotal
  _dbg('H2 | discount.js:44 | subtotal_before | ' + subtotal);
  _dbg('H2 | discount.js:48 | discount_rate | ' + rate);
  _dbg('H2 | discount.js:52 | subtotal_after | ' + result);
  // #endregion DEBUG
  ```
- For browser apps, start the log ingest server before instrumentation (see **Log Output Strategy** above) and use `fetch()` calls instead of file append

After adding instrumentation, tell the user exactly what was added and where.

---

## Phase 3: Reproduction Request (Interactive Loop)

After adding instrumentation, present an interactive reproduction menu. **You MUST use a tool call that blocks execution and waits for the user to select an answer** — do NOT just print the choices as text in your response. Use whichever tool your platform provides for asking the user a question with predefined selectable answers (e.g. `ask`, `askQuestion`, `ask_user`, or equivalent).

**Question text:**
> I've added instrumentation to test [H1, H2, H3].
>
> Please reproduce the bug using these steps:
> 1. [reproduction step 1 from Phase 0]
> 2. [reproduction step 2 from Phase 0]
> 3. ...
>
> Debug output will be written to `./debug-output.log`. I'll read it after you reproduce.
> If the app needs a restart/rebuild, do that first.
>
> After testing, select an option below.

**Answer choices:**
1. `Issue reproduced -- proceed with analysis`
2. `Mark as fixed`

If your platform does **not** provide a blocking question tool with selectable answers, present the same prompt and the same two choices as plain text, then wait for the user's reply before continuing.

**Behavior:**
- **"Issue reproduced"** → proceed to Phase 4 (Log Analysis). The agent reads `./debug-output.log` directly.
- **"Mark as fixed"** → skip directly to Phase 7 (Cleanup).

---

## Phase 4: Log Analysis

Read `./debug-output.log` (or whatever log file path was used). Then:

1. Parse the log lines using the `<Hn> | <file>:<line> | <label> | <value>` format — filter by hypothesis label to group related lines
2. For each hypothesis, check whether the logs confirm, refute, or are inconclusive
3. Identify the specific line/value that reveals the root cause
4. If the root cause is still unclear, go back to Phase 2 and add more targeted instrumentation

**After every analysis round, you MUST present a verdict for every hypothesis.** Use this exact format — one bullet per hypothesis, no exceptions:

```
- H1 (Off-by-one in cursor): RULED OUT — cursor value 42 matches expected
- H2 (Discount not applied to subtotal): CONFIRMED — subtotal_after equals subtotal_before, discount_rate=0.1 but never applied
- H3 (Wrong product ID in lookup): INCONCLUSIVE — insufficient data, adding more logs
```

Every hypothesis must get one of: **CONFIRMED**, **RULED OUT**, or **INCONCLUSIVE**.
- If any are INCONCLUSIVE, go back to Phase 2 with more targeted instrumentation for those specific hypotheses.
- If one or more are CONFIRMED, proceed to Phase 5.
- If all are RULED OUT, generate new hypotheses (return to Phase 1).

### Log file management between iterations

Before each new reproduction cycle, decide whether to **clear** or **append** to the log file:

- **Clear** when: the fix changed behavior and old log lines would be misleading, or you're narrowing to fewer hypotheses and want to reduce noise
- **Append** when: you want to compare values across iterations (e.g., "did this value change after the fix?"), or multiple hypotheses are still open and prior data is still useful

State your choice and reasoning briefly when presenting the reproduction menu.

---

## Phase 5: Fix

**Prerequisite:** You may only reach this phase after log evidence from Phase 4 has **confirmed** a hypothesis. Confidence from code reading alone is not sufficient — you must have observed the actual runtime values that prove the root cause. If you haven't run through Phases 2–4, go back.

Once the root cause is confirmed by log evidence, propose a **targeted fix**:

- Fix only what the evidence points to — don't refactor unrelated things
- Show a diff-style before/after if the change is non-trivial
- Briefly explain *why* the fix addresses the confirmed root cause
- If the fix has side effects or risks, call them out

After applying the fix, present the **interactive reproduction menu** again (same mechanism as Phase 3) to let the user verify. See Phase 6.

---

## Phase 6: Verification (Interactive Loop)

After the fix is applied, use the same **blocking question tool** again (not a text message — a tool call with selectable answers):

**Question text:**
> Fix applied: [brief description of what was changed].
>
> Please reproduce the bug using the original steps to verify the fix.
> After testing, select an option below.

**Answer choices:**
1. `Issue still present -- fix did not work`
2. `Mark as fixed`

If your platform does **not** provide a blocking question tool with selectable answers, present the same prompt and the same two choices as plain text, then wait for the user's reply before continuing.

**Behavior:**
- **"Issue still present"** → go back to Phase 4 with fresh logs. Update the hypothesis list — the confirmed root cause may have been a symptom of something deeper. Add more instrumentation if needed.
- **"Mark as fixed"** → proceed to Phase 7 (Cleanup).

**Abandoning the debug session:**
At any point, if the user says they want to stop debugging (e.g., "abandon", "stop", "give up", "cancel"), proceed directly to Phase 7 (Cleanup). **Always clean up, even when abandoning.**

This loop continues — cycling through Phases 2–6 — until the user selects "Mark as fixed" or explicitly abandons the session.

---

## Phase 7: Cleanup

Once the issue is marked as fixed (or the session is abandoned), perform **ALL** of the following cleanup steps. This is critical — no debug artifacts should survive.

### 1. Stop the log ingest server (if running)

If the log ingest server was started during this session, read the PID from `./debug-ingest.pid` and kill that process. Then delete both `./debug-ingest.pid` and `./debug-ingest.port`. The server attempts to clean these up on graceful shutdown, but verify they're gone.

### 2. Delete the log file

Delete the log file that was passed as `--logFile` (e.g. `./debug-output.log`).

### 3. Remove all `#region DEBUG` blocks

Search the codebase for files containing `region DEBUG`. For each file, remove the entire block from the start marker through the end marker, inclusive of all content between. Verify that no debug regions remain.

> See [cleanup-patterns.md](references/cleanup-patterns.md) for per-language regex patterns.

### 4. Remove debug-only imports

Check for any imports that were added solely for debug logging (e.g., `import json` in Python). These should have been inside region blocks, but verify independently.

### 5. Final artifact scan

Search the codebase for any remaining occurrences of:
- `region DEBUG`
- `debug-output.log` (or whatever log file path was used)
- `debug-ingest.pid` and `debug-ingest.port` (delete these files if they still exist)
- `localhost:<port>/log` (if the ingest server was used)
- `_dbg` helper functions added for debug logging

If any artifacts remain, remove them.

### 6. Confirm cleanup

Tell the user: *"Cleanup complete. All debug instrumentation, region blocks, log files, and the ingest server have been removed."*

---

## Edge Cases & Special Situations

### Bug is hard to reproduce
If the user can't easily reproduce the bug, help them write a minimal test or script that reliably triggers it before proceeding to instrumentation.

### Async / concurrent bugs
For race conditions or async timing issues:
- Include timestamps in log lines: `_dbg('H1 | ' + Date.now() + ' | label | ' + value)`
- Log event loop / promise chain entry and resolution points
- Consider adding artificial delays to expose timing-dependent behavior

### Production-only bugs
If the bug only appears in production:
- Propose the minimum safe instrumentation that can be deployed to prod
- Prefer structured log fields over `console.log` for production use
- Agree with the user on whether to deploy debug instrumentation or reproduce locally with prod data

### Bug reappears after fix
Reopen the hypothesis list. The original root cause may have been a symptom of a deeper issue. Treat this as a new debug cycle starting at Phase 1.

---

## Quick Reference Card

```
Phase 0  →  Intake: symptom, expected, repro steps, env
Phase 1  →  Hypotheses: 3–6, ordered by plausibility, no fixes yet
Phase 2  →  Instrumentation: targeted logs in #region DEBUG blocks
Phase 3  →  INTERACTIVE MENU: ask human to reproduce, choose outcome
Phase 4  →  Analysis: confirm/refute each hypothesis from log evidence
Phase 5  →  Fix: targeted, evidence-based, show diff
Phase 6  →  INTERACTIVE MENU: human verifies fix, choose outcome
Phase 7  →  Cleanup: remove regions, log file, ingest server, all artifacts
         ↺  Loop Phases 2–6 until "Mark as fixed" or abandoned
```

---

## Agent Compatibility Notes

This skill is designed to work with AI coding agents that can read/write files and interact with the user. It works best when the agent also has a blocking question tool, but it can fall back to plain-text prompts when that tool is unavailable.

**Interactive menu:** You MUST use a tool call that presents selectable answer choices and blocks until the user responds (e.g. `ask`, `askQuestion`, `ask_user`, or equivalent). Do NOT just print the choices as text — that does not block execution and the agent will continue without waiting. Only fall back to printing choices as text if your platform genuinely has no such tool.

**Log ingest server:** The ingest script is bundled at [`scripts/http-log-ingest.js`](scripts/http-log-ingest.js) inside this skill's directory — do NOT create your own. Follow the **Server launch procedure** in the Log Output Strategy section: try once, if blocked ask the user, if that fails fall back to `console.log`. Do NOT try creative workarounds (REPL, PowerShell jobs, child_process hacks) — they waste tokens and always fail.

**Cleanup:** The `#region DEBUG` blocks and isolated log file make instrumentation easy to search for and remove programmatically. Always use them consistently.

> See [cleanup-patterns.md](references/cleanup-patterns.md) for regex patterns and [framework-recipes.md](references/framework-recipes.md) for framework-specific instrumentation examples.

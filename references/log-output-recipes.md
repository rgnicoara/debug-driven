# Log Output Recipes

Per-language logging patterns and the browser log ingest server procedure for the debug-driven skill.

---

## Non-browser apps

Instrumentation writes directly to the log file using the language's native file-append API. No extra server or process is needed.

### Quick reference table

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

### Full examples by language

**JavaScript / TypeScript (Node):**

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

**Java / Kotlin:**

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

---

## Browser apps (SPAs, PWAs)

Browser code cannot write to the filesystem. Use the HTTP log ingest server bundled with this skill.

### Server location

**The ingest script lives at [`scripts/http-log-ingest.js`](../scripts/http-log-ingest.js) inside this skill's directory.** Resolve the full path from the skill installation location:
- If `CLAUDE_SKILL_DIR` or equivalent is available, use `${CLAUDE_SKILL_DIR}/scripts/http-log-ingest.js`
- Otherwise, find this skill's directory (search for the `debug-driven` skill folder under `.codex/skills/`, `.claude/skills/`, or wherever skills are installed) and reference `scripts/http-log-ingest.js` inside it

**Do NOT create your own ingest script.** The one bundled with this skill is ready to use.

### Server launch procedure

**The script self-daemonizes.** Run it as a normal, blocking command - no `&`, no `Start-Process`, no background tricks needed. It forks a detached server process, waits for it to be ready, prints the port, and exits cleanly. The server keeps running after the command returns.

```bash
node <skill-dir>/scripts/http-log-ingest.js --logFile ./debug-output.log
```

Where `<skill-dir>` is the resolved path to this skill's installation directory.

After the command returns (exit code 0), `./debug-ingest.port` and `./debug-ingest.pid` will exist. **Do NOT** use `&`, `Start-Process`, `Start-Job`, REPL tricks, or any other background launch pattern - just run the command normally.

**If the command fails** (exit code 1, permissions error, etc.), ask the user to run the exact same command in a separate terminal. Use the fully resolved path so the user can copy-paste directly. Then wait for `./debug-ingest.port` to appear before continuing.

**Only if the user explicitly declines** to run the server (they say "no", "can't", "skip it", etc.), fall back to `console.log` instrumentation for browser apps. The user will need to paste the relevant console output manually when reproducing. **You MUST NOT choose this fallback on your own** - difficulty launching the server, confidence in a hypothesis, or wanting to "move faster" are not valid reasons to skip the ingest server. Always attempt the server first.

### After the server is running

The server lets the OS assign a free port (no conflicts), then writes:
- `./debug-ingest.pid` - the server's process ID (for cleanup)
- `./debug-ingest.port` - the assigned port number

**Read the port**, then **instrument with `fetch()`**:

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

Replace `<port>` with the value from `./debug-ingest.port` when writing instrumentation code.

The server writes to `./debug-output.log` (relative to the project root, not the skill directory).

### After reproduction

The agent reads `./debug-output.log` directly to perform log analysis (Phase 4). The user does not need to paste log output, though they may still provide additional context.

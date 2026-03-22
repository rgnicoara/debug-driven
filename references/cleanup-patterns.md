# Cleanup Patterns

Regex patterns and strategies for removing `#region DEBUG` blocks and all debug artifacts after a debug session.

---

## Region Block Removal

Each language uses slightly different region markers. Below are the **regex patterns** to match the full block (start marker through end marker, inclusive of all content between).

### JavaScript / TypeScript

```
Start:  ^\s*// #region DEBUG\s*$
End:    ^\s*// #endregion DEBUG\s*$
```

Example block to remove:
```js
// #region DEBUG
const fs = require('fs');
const _dbg = (msg) => fs.appendFileSync('./debug-output.log', msg + '\n');
// Testing H2: discount not applied
_dbg('H2 | cart.js:44 | subtotal | ' + subtotal);
// #endregion DEBUG
```

**Multiline regex:** `^\s*// #region DEBUG\s*\n[\s\S]*?^\s*// #endregion DEBUG\s*\n?`

### Python

```
Start:  ^\s*# region DEBUG\s*$
End:    ^\s*# endregion DEBUG\s*$
```

Example:
```python
# region DEBUG
import json
_dbg = lambda msg: open('./debug-output.log', 'a').write(msg + '\n')
_dbg(f"H1 | api.py:12 | payload | {json.dumps(data)}")
# endregion DEBUG
```

**Multiline regex:** `^\s*# region DEBUG\s*\n[\s\S]*?^\s*# endregion DEBUG\s*\n?`

### C\#

```
Start:  ^\s*#region DEBUG\s*$
End:    ^\s*#endregion DEBUG\s*$
```

Note: C# region directives have **no** comment prefix — `#region` is a preprocessor directive.

**Multiline regex:** `^\s*#region DEBUG\s*\n[\s\S]*?^\s*#endregion DEBUG\s*\n?`

### Java / Kotlin / Go / Rust

```
Start:  ^\s*// region DEBUG\s*$
End:    ^\s*// endregion DEBUG\s*$
```

**Multiline regex:** `^\s*// region DEBUG\s*\n[\s\S]*?^\s*// endregion DEBUG\s*\n?`

### Ruby

```
Start:  ^\s*# region DEBUG\s*$
End:    ^\s*# endregion DEBUG\s*$
```

Same pattern as Python.

---

## Universal Catch-All Pattern

If you don't know the language or want a single pass across mixed-language files:

```
^\s*(?://\s*#?|#\s*)region DEBUG\s*$
```

This matches all start markers across all supported languages. The corresponding end marker pattern:

```
^\s*(?://\s*#?|#\s*)endregion DEBUG\s*$
```

---

## Artifact Scan Patterns

After removing region blocks, scan for any remaining artifacts with these patterns:

| What to find | Pattern |
|---|---|
| Any remaining region markers | `region DEBUG` |
| Debug log file references | `debug-output\.log` |
| Debug PID file | `debug-ingest\.pid` |
| Debug port file | `debug-ingest\.port` |
| Debug helper functions | `_dbg` |
| Log ingest fetch calls | `localhost:\d+/log` |
| Debug-only imports (Python) | `^\s*import\s+json\s*$` (if only used for debug) |
| Debug-only requires (Node) | `require\(.*fs.*\)` (if only used for debug file writes) |

---

## Cleanup Strategy

1. **Search** for all files containing `region DEBUG`
2. **For each file**, identify every start/end marker pair
3. **Delete** everything from the start marker line through the end marker line (inclusive)
4. **Remove trailing blank lines** left behind if the block was surrounded by empty lines
5. **Scan** for orphaned `_dbg` references or `debug-output.log` strings that may have been placed outside a region block (shouldn't happen, but verify)
6. **Delete** the log file (`./debug-output.log` or whatever path was used)
7. **Stop** the ingest server: read PID from `./debug-ingest.pid`, kill that process, delete `./debug-ingest.pid` and `./debug-ingest.port`
8. **Final scan** with all artifact patterns above — nothing should remain

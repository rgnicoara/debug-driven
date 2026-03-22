# Framework-Specific Instrumentation Recipes

Instrumentation patterns for popular frameworks. All recipes use `#region DEBUG` blocks and log to `./debug-output.log`.

**Logging strategy:**
- **Non-browser apps** log to a file using a `_dbg()` helper that appends to `./debug-output.log`. Define the helper once per file inside the first `#region DEBUG` block.
- **Browser apps** use `fetch()` to POST to the log ingest server, which writes to the same file. Read the assigned port from `./debug-ingest.port` and replace `<port>` in the examples below.
- The agent reads the log file directly after reproduction — no need for the user to paste output.
- All log lines start with the hypothesis label (`H1 |`, `H2 | `, etc.) for easy grep-based filtering. Replace `Hn` in the examples below with the actual hypothesis label.

---

## React (Client Components)

Browser-side — use the log ingest server via `fetch()`:

```jsx
// #region DEBUG
// Testing H1: stale state after re-render
const _dbg = (msg) => fetch('http://localhost:<port>/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg }) });
useEffect(() => {
  _dbg('H1 | MyComponent | mount/update | props=' + JSON.stringify(props));
  _dbg('H1 | MyComponent | state | count=' + count + ' items=' + items.length);
  return () => _dbg('H1 | MyComponent | cleanup |');
}, [count, items]);
// #endregion DEBUG
```

### React Server Components / Server Actions

Server-side — log to file:

```jsx
// #region DEBUG
const fs = require('fs');
const _dbg = (msg) => fs.appendFileSync('./debug-output.log', msg + '\n');
// Testing H2: data not fetched correctly
_dbg('H2 | fetchProducts | input | ' + JSON.stringify(filters));
const products = await db.query(filters);
_dbg('H2 | fetchProducts | result | count=' + products.length);
// #endregion DEBUG
```

---

## Next.js

### API Routes / Route Handlers

```ts
// #region DEBUG
import fs from 'fs';
const _dbg = (msg: string) => fs.appendFileSync('./debug-output.log', msg + '\n');
_dbg('H1 | GET /api/orders | query | ' + request.nextUrl.searchParams.toString());
_dbg('H1 | GET /api/orders | session | ' + JSON.stringify(session));
// #endregion DEBUG
```

### Middleware

```ts
// #region DEBUG
import fs from 'fs';
const _dbg = (msg: string) => fs.appendFileSync('./debug-output.log', msg + '\n');
_dbg('H1 | middleware | pathname | ' + request.nextUrl.pathname);
_dbg('H1 | middleware | cookies | ' + JSON.stringify(Object.fromEntries(request.cookies.getAll().map(c => [c.name, c.value]))));
// #endregion DEBUG
```

### Server Actions

```ts
// #region DEBUG
import fs from 'fs';
const _dbg = (msg: string) => fs.appendFileSync('./debug-output.log', msg + '\n');
_dbg('H1 | createOrder | formData | ' + JSON.stringify(Object.fromEntries(formData)));
// #endregion DEBUG
```

---

## Angular

Browser-side — use the log ingest server via `fetch()`:

### Component lifecycle

```ts
// #region DEBUG
const _dbg = (msg: string) => fetch('http://localhost:<port>/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg }) });
ngOnInit() {
  _dbg('H1 | OrderComponent | ngOnInit | orderId=' + this.orderId);
}
ngOnChanges(changes: SimpleChanges) {
  _dbg('H1 | OrderComponent | ngOnChanges | ' + JSON.stringify(
    Object.keys(changes).reduce((acc, k) => ({ ...acc, [k]: { prev: changes[k].previousValue, curr: changes[k].currentValue } }), {})
  ));
}
// #endregion DEBUG
```

### Signals

```ts
// #region DEBUG
const _dbg = (msg: string) => fetch('http://localhost:<port>/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg }) });
effect(() => {
  _dbg('H1 | orderSignal | value | ' + JSON.stringify(this.orderSignal()));
});
// #endregion DEBUG
```

### RxJS Observables

```ts
// #region DEBUG
const _dbg = (msg: string) => fetch('http://localhost:<port>/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg }) });
this.orders$ = this.orderService.getOrders().pipe(
  tap(orders => _dbg('H1 | orders$ | emitted | count=' + orders.length)),
  tap({ error: err => _dbg('H1 | orders$ | error | ' + err.message) })
);
// #endregion DEBUG
```

### HTTP Interceptor

```ts
// #region DEBUG
const _dbg = (msg: string) => fetch('http://localhost:<port>/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg }) });
// Testing H3: auth header missing on some requests
_dbg('H3 | interceptor | request | ' + req.method + ' ' + req.url + ' auth=' + req.headers.has('Authorization'));
// #endregion DEBUG
```

---

## Vue 3

Browser-side — use the log ingest server via `fetch()`:

### Composition API

```js
// #region DEBUG
const _dbg = (msg) => fetch('http://localhost:<port>/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg }) });
watch(cart, (newVal, oldVal) => {
  _dbg('H1 | cart | watch | old=' + JSON.stringify(oldVal) + ' new=' + JSON.stringify(newVal));
}, { deep: true });

onMounted(() => _dbg('H1 | CartView | mounted | items=' + cart.value.length));
onUnmounted(() => _dbg('H1 | CartView | unmounted |'));
// #endregion DEBUG
```

### Pinia Store

```js
// #region DEBUG
const _dbg = (msg) => fetch('http://localhost:<port>/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg }) });
this.$subscribe((mutation, state) => {
  _dbg('H1 | cartStore | mutation | ' + mutation.type + ' ' + mutation.storeId + ' ' + JSON.stringify(state));
});
// #endregion DEBUG
```

---

## Express.js

### Middleware-level instrumentation

```js
// #region DEBUG
const fs = require('fs');
const _dbg = (msg) => fs.appendFileSync('./debug-output.log', msg + '\n');
// Testing H1: request body not parsed correctly
app.use((req, res, next) => {
  _dbg('H1 | request | ' + req.method + ' ' + req.url + ' | body=' + JSON.stringify(req.body));
  const originalSend = res.send;
  res.send = function(data) {
    _dbg('H1 | response | ' + req.method + ' ' + req.url + ' | status=' + res.statusCode + ' | body=' + (typeof data === 'string' ? data.substring(0, 200) : JSON.stringify(data)));
    return originalSend.call(this, data);
  };
  next();
});
// #endregion DEBUG
```

### Route-level

```js
// #region DEBUG
const fs = require('fs');
const _dbg = (msg) => fs.appendFileSync('./debug-output.log', msg + '\n');
_dbg('H1 | POST /orders | userId=' + req.user.id + ' | items=' + JSON.stringify(req.body.items));
// #endregion DEBUG
```

---

## Django

### View-level

```python
# region DEBUG
_dbg = lambda msg: open('./debug-output.log', 'a').write(msg + '\n')
# Testing H2: queryset returning wrong results
_dbg(f"H2 | OrderListView.get_queryset | user={self.request.user.id} | filters={self.request.GET.dict()!r}")
qs = super().get_queryset()
_dbg(f"H2 | OrderListView.get_queryset | count={qs.count()} | sql={qs.query!s}")
# endregion DEBUG
```

### Middleware

```python
# region DEBUG
_dbg = lambda msg: open('./debug-output.log', 'a').write(msg + '\n')
class DebugModeMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
    def __call__(self, request):
        _dbg(f"H1 | middleware | {request.method} {request.path} | user={getattr(request, 'user', 'anon')}")
        response = self.get_response(request)
        _dbg(f"H1 | middleware | {request.method} {request.path} | status={response.status_code}")
        return response
# endregion DEBUG
```

### Signals

```python
# region DEBUG
_dbg = lambda msg: open('./debug-output.log', 'a').write(msg + '\n')
from django.db.models.signals import post_save
def debug_order_save(sender, instance, created, **kwargs):
    _dbg(f"H1 | Order.post_save | id={instance.id} | created={created} | total={instance.total}")
post_save.connect(debug_order_save, sender=Order)
# endregion DEBUG
```

---

## Flask

```python
# region DEBUG
_dbg = lambda msg: open('./debug-output.log', 'a').write(msg + '\n')
@app.before_request
def debug_before():
    _dbg(f"H1 | before_request | {request.method} {request.path} | args={request.args.to_dict()!r} | json={request.get_json(silent=True)!r}")

@app.after_request
def debug_after(response):
    _dbg(f"H1 | after_request | {request.method} {request.path} | status={response.status_code}")
    return response
# endregion DEBUG
```

---

## FastAPI

```python
# region DEBUG
_dbg = lambda msg: open('./debug-output.log', 'a').write(msg + '\n')
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

class DebugMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        body = await request.body()
        _dbg(f"H1 | request | {request.method} {request.url.path} | body={body.decode()[:200]}")
        response = await call_next(request)
        _dbg(f"H1 | response | {request.method} {request.url.path} | status={response.status_code}")
        return response
# endregion DEBUG
```

---

## Spring Boot (Java)

### Controller

```java
// region DEBUG
// Testing H1: request mapping not matching
java.nio.file.Files.write(java.nio.file.Path.of("./debug-output.log"),
    ("H1 | OrderController.create | body=" + objectMapper.writeValueAsString(orderDto) + "\n").getBytes(),
    java.nio.file.StandardOpenOption.CREATE, java.nio.file.StandardOpenOption.APPEND);
java.nio.file.Files.write(java.nio.file.Path.of("./debug-output.log"),
    ("H1 | OrderController.create | principal=" + principal.getName() + "\n").getBytes(),
    java.nio.file.StandardOpenOption.CREATE, java.nio.file.StandardOpenOption.APPEND);
// endregion DEBUG
```

### Filter / Interceptor

```java
// region DEBUG
@Override
public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
    java.nio.file.Files.write(java.nio.file.Path.of("./debug-output.log"),
        ("H1 | interceptor | " + request.getMethod() + " " + request.getRequestURI()
            + " | params=" + request.getParameterMap() + "\n").getBytes(),
        java.nio.file.StandardOpenOption.CREATE, java.nio.file.StandardOpenOption.APPEND);
    return true;
}
// endregion DEBUG
```

---

## ASP.NET Core (C\#)

### Controller

```csharp
#region DEBUG
System.IO.File.AppendAllText("./debug-output.log",
    $"H1 | OrdersController.Post | model={JsonSerializer.Serialize(order)}\n");
System.IO.File.AppendAllText("./debug-output.log",
    $"H1 | OrdersController.Post | user={User.Identity?.Name}\n");
#endregion DEBUG
```

### Middleware

```csharp
#region DEBUG
app.Use(async (context, next) => {
    System.IO.File.AppendAllText("./debug-output.log",
        $"H1 | middleware | {context.Request.Method} {context.Request.Path}\n");
    await next();
    System.IO.File.AppendAllText("./debug-output.log",
        $"H1 | middleware | {context.Request.Method} {context.Request.Path} | status={context.Response.StatusCode}\n");
});
#endregion DEBUG
```

---

## Gin (Go)

```go
// region DEBUG
_dbg := func(msg string) {
    f, _ := os.OpenFile("./debug-output.log", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
    defer f.Close()
    f.WriteString(msg + "\n")
}
r.Use(func(c *gin.Context) {
    _dbg(fmt.Sprintf("H1 | request | %s %s | params=%v", c.Request.Method, c.Request.URL.Path, c.Params))
    c.Next()
    _dbg(fmt.Sprintf("H1 | response | %s %s | status=%d", c.Request.Method, c.Request.URL.Path, c.Writer.Status()))
})
// endregion DEBUG
```

---

## Ruby on Rails

### Controller

```ruby
# region DEBUG
_dbg = ->(msg) { File.open('./debug-output.log', 'a') { |f| f.puts(msg) } }
_dbg.call("H1 | OrdersController#create | params=#{params.to_unsafe_h.inspect}")
_dbg.call("H1 | OrdersController#create | current_user=#{current_user&.id}")
# endregion DEBUG
```

### Around Action

```ruby
# region DEBUG
around_action :debug_action
def debug_action
  File.open('./debug-output.log', 'a') { |f| f.puts("H1 | #{controller_name}##{action_name} | START | params=#{params.to_unsafe_h.inspect}") }
  yield
  File.open('./debug-output.log', 'a') { |f| f.puts("H1 | #{controller_name}##{action_name} | END | status=#{response.status}") }
end
# endregion DEBUG
```

---

## SwiftUI / iOS

```swift
// region DEBUG
func _dbg(_ msg: String) {
    let url = URL(fileURLWithPath: "./debug-output.log")
    if let handle = try? FileHandle(forWritingTo: url) {
        handle.seekToEndOfFile()
        handle.write((msg + "\n").data(using: .utf8)!)
        handle.closeFile()
    } else {
        try? (msg + "\n").write(to: url, atomically: false, encoding: .utf8)
    }
}
let _ = _dbg("H1 | ContentView | body | items=\(items.count) selected=\(String(describing: selectedItem))")
// endregion DEBUG
```

### Combine

```swift
// region DEBUG
cancellable = publisher
    .handleEvents(
        receiveOutput: { value in _dbg("H1 | publisher | output | \(value)") },
        receiveCompletion: { completion in _dbg("H1 | publisher | completion | \(completion)") }
    )
    .sink { _ in }
// endregion DEBUG
```

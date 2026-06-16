# Todo List Skill for AI Agents

Use this todo list backend at `https://todo.lugu.mywire.org` (or the configured server URL).

## Authentication

Login with the fixed topic `SECRET_LOGIN` before performing any todo operations.

### Login
```bash
curl -X POST https://todo.lugu.mywire.org/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"topic":"SECRET_LOGIN"}'
```

Response includes `{ "token": "...", ... }`. Use this token as a Bearer token in all subsequent requests.

### Headers
```bash
HEADERS="-H \"Content-Type: application/json\" -H \"Authorization: Bearer <token>\""
```

---

## Operations

### 1. List Todo Items
```bash
curl $HEADERS https://todo.lugu.mywire.org/api/todos
```

### 2. Add Item
```bash
curl -X POST $HEADERS https://todo.lugu.mywire.org/api/todos \
  -d '{"text":"Buy milk"}'
```

### 3. Remove Item
```bash
curl -X DELETE $HEADERS https://todo.lugu.mywire.org/api/todos/<id>
```

### 4. Mark as Done
```bash
curl -X PUT $HEADERS https://todo.lugu.mywire.org/api/todos/<id> \
  -d '{"done":true}'
```

### 5. Mark as Undone
```bash
curl -X PUT $HEADERS https://todo.lugu.mywire.org/api/todos/<id> \
  -d '{"done":false}'
```

## Notes
- `<id>` is the numeric todo ID returned by the list or add operations.
- The `done` field is a boolean.
- Toasts/notifications are handled automatically by the frontend via WebSocket; backend only stores and broadcasts state.

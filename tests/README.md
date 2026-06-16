# 🧪 Tests

This directory contains manual integration tests for the Todo PWA backend API.

> **Prerequisites:** The server must be running on `http://localhost:3004` before executing any test.
> Start it with: `npm start`

---

## 📁 Test Files

| File | Type | What it tests |
|------|------|---------------|
| [`test-undo.js`](test-undo.js) | Node.js | Unicode/emoji support + undo (step-by-step) |
| [`test-undo-all.js`](test-undo-all.js) | Node.js | Multiple deletes + undo ALL at once |
| [`test-undo.sh`](test-undo.sh) | Bash (curl) | REST API endpoints via curl |

---

## 🟦 test-undo.js

**Tests Unicode, emoji, multilingual text, and the undo flow.**

### What it does:
1. Adds todos with special characters, emojis, and multilingual text:
   - Accented characters (`áéíóúüőű`)
   - Emojis (`😀😂🥰🔥💯`)
   - 🇨🇳 Chinese: `你好世界`
   - 🇵🇰 Urdu: `ہیلو دنیا`
   - 🇯🇵 Japanese: `こんにちは世界`
   - 🇮🇳 Hindi: `नमस्ते दुनिया`
   - 🇮🇱 Hebrew: `שלום עולם`
   - 🇸🇦 Arabic: `مرحبا بالعالم`
2. Deletes two todos
3. Undoes the second deletion (restores 1 item)
4. Undoes the first deletion (restores all)
5. Toggles a todo to done, then undoes the toggle

### Run:
```bash
node tests/test-undo.js
```

---

## 🟩 test-undo-all.js

**Tests deleting multiple items and restoring all of them in a single undo operation.**

### What it does:
1. Creates 4 todos: `1`, `2`, `3`, `4`
2. Deletes todos `1`, `2`, `3`
3. Verifies only `4` remains
4. Restores all todos at once via `PUT /api/todos`
5. Verifies all 4 todos are back

### Run:
```bash
node tests/test-undo-all.js
```

---

## 🟨 test-undo.sh

**Tests the REST API directly using `curl`. Requires `jq` for JSON formatting.**

### What it does:
1. `GET /api/todos` — lists all todos
2. `DELETE /api/todos/3` — deletes a specific todo
3. `PUT /api/todos` — restores a full state (undo)
4. Deletes multiple todos and tests multi-undo

### Run:
```bash
bash tests/test-undo.sh
```

> **Note:** This script uses hardcoded IDs. Edit the IDs in the script to match your current data before running.

---

## 🔑 Authentication Note

The current test scripts do **not** include authentication headers. If the server requires a topic (default: `todopwa2026`), you need to:

1. Login first to get a token:
   ```bash
   curl -s -X POST http://localhost:3004/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"topic":"todopwa2026"}'
   ```
2. Use the returned token in subsequent requests:
   ```bash
   curl -s http://localhost:3004/api/todos \
     -H "Authorization: Bearer <your-token>"
   ```

---

## ✅ Expected Results

| Test | Expected outcome |
|------|-----------------|
| Unicode todos | All characters stored and retrieved correctly |
| Delete + undo | Deleted items restored to original state |
| Multi-delete + undo all | All items restored in one operation |
| Toggle + undo | `done` flag reverted correctly |

## Other

```
Stop-Process -Id (Get-NetTCPConnection -LocalPort 3004).OwningProcess -Force
```
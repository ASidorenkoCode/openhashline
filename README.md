# open-hashline

**Stop reproducing code to edit it.** An [OpenCode](https://github.com/anomalyco/opencode) plugin that tags every line with a content hash, so the model references lines by hash instead of copying exact text.

Based on the [Harness Problem](https://blog.can.ac/2026/02/12/the-harness-problem/) — most LLM edit failures are mechanical, not intellectual. Models know *what* to change but fail at *locating* it because they must reproduce exact content (including whitespace) to specify edit locations.

---

## The Problem

When an LLM edits a file, it needs to specify *which lines* to change. The standard approach requires the model to reproduce the exact content of those lines as `oldString` — including every space, tab, and quote. This is fragile:

- Whitespace mismatches cause silent failures
- Long lines get truncated or hallucinated
- Repeated content creates ambiguity
- The model wastes tokens reproducing code it already read

## The Solution

Hashline tags every line the model reads with a short content hash:

```
 42:a3f| function hello() {
 43:f1b|   return "world";
 44:0e9| }
```

To edit, the model just references the hash — no content reproduction needed:

```json
{ "startHash": "42:a3f", "endHash": "44:0e9", "content": "function hello() {\n  return \"universe\";\n}" }
```

The plugin resolves hashes back to actual content before the built-in edit tool runs. The TUI diff display works exactly as before.

---

## How It Works

1. **Read** — The `tool.execute.after` hook transforms read output, tagging each line as `<line>:<hash>| <content>` and storing a per-file hash map in memory.

2. **Edit schema** — The `tool.definition` hook replaces the edit tool's parameters (and `apply_patch` for Codex models) with `startHash`, `endHash`, `afterHash`, and `content`.

3. **Edit resolve** — The `tool.execute.before` hook intercepts hash-based edits and resolves them to the format the underlying tool expects — `oldString`/`newString` for `edit` (Anthropic), or generated `patchText` for `apply_patch` (Codex).

4. **System prompt** — The `experimental.chat.system.transform` hook injects instructions so the model knows to use hashline references.

No modifications are made to any built-in tools. Everything works through hooks.

---

## Three Edit Operations

### 1. Replace a single line

```json
{ "startHash": "3:cc7", "content": "  \"version\": \"2.0.0\"," }
```

### 2. Replace a range of lines

```json
{ "startHash": "10:a1b", "endHash": "15:f3d", "content": "// new implementation\nfunction updated() {\n  return true;\n}" }
```

### 3. Insert after a line

```json
{ "afterHash": "7:e2c", "content": "  \"newField\": \"value\"," }
```

### 4. Multi-file edit (Codex / `apply_patch`)

Codex models use the `apply_patch` tool which accepts an `edits` array — multiple files and multiple edits per file in a single call:

```json
{
  "edits": [
    { "filePath": "/project/src/config.ts", "startHash": "3:cc7", "content": "  version: \"2.0.0\"," },
    { "filePath": "/project/src/config.ts", "afterHash": "5:e60", "content": "  debug: true," },
    { "filePath": "/project/src/index.ts", "startHash": "10:a1b", "endHash": "12:f3d", "content": "// refactored" }
  ]
}
```

Edits to the same file are grouped into a single patch section with multiple `@@` chunks, sorted by line number.

---

## Installation

### Prerequisites

- [OpenCode](https://github.com/anomalyco/opencode) with the `tool.definition` hook (PR [#4956](https://github.com/anomalyco/opencode/pull/4956))
- [Bun](https://bun.sh) runtime

### Option 1: Install from npm (recommended)

```bash
npm install open-hashline
```

or with Bun:

```bash
bun add open-hashline
```

The postinstall script automatically adds `open-hashline` to your project's `.opencode/opencode.json` config. No manual configuration needed.

### Option 2: Install from source

```bash
git clone https://github.com/ASidorenkoCode/openhashline.git
cd openhashline
bun install
```

Then add to your OpenCode config using a file path:

```json
{
  "plugins": {
    "hashline": {
      "module": "file:///path/to/openhashline/src/index.ts"
    }
  }
}
```

### Start OpenCode

```bash
opencode
```

That's it. Read any file and you'll see hash markers on every line. Edits will automatically use hash references.

---

## Hash Algorithm

Each line is hashed using djb2, truncated to 3 hex characters (4096 possible values):

```typescript
function hashLine(content: string): string {
  const trimmed = content.trimEnd()
  let h = 5381
  for (let i = 0; i < trimmed.length; i++) {
    h = ((h << 5) + h + trimmed.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(16).slice(-3).padStart(3, "0")
}
```

Collisions are rare and disambiguated by line number — the full reference is `<lineNumber>:<hash>` (e.g. `42:a3f`).

---

## Edge Cases

| Scenario | Behavior |
|---|---|
| **Stale hashes** | File changed since last read — edit rejected, model told to re-read |
| **File not previously read** | Falls through to normal `oldString`/`newString` or `patchText` edit |
| **Codex models** | Hash refs resolved to `patchText` format for `apply_patch` tool |
| **Hash collision** | Line number provides disambiguation |
| **Partial/offset reads** | Hashes merge with existing stored hashes for the file |
| **Edit invalidation** | Stored hashes cleared after any edit to prevent stale references |

---

## Project Structure

```
open-hashline/
├── src/
│   └── index.ts       # Plugin implementation (single file)
├── package.json
├── tsconfig.json
├── LICENSE
└── README.md
```

---

## Contributing

Contributions are welcome. Please open an issue or submit a pull request.

## License

This project is licensed under the [MIT License](LICENSE).

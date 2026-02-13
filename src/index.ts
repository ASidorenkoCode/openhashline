import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import * as fs from "fs"
import * as path from "path"

const z = tool.schema

/**
 * djb2 hash of trimmed line content, truncated to 3 hex chars.
 * 3 hex chars = 4096 values. Collisions are rare and disambiguated by line number.
 */
function hashLine(content: string): string {
  const trimmed = content.trimEnd()
  let h = 5381
  for (let i = 0; i < trimmed.length; i++) {
    h = ((h << 5) + h + trimmed.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(16).slice(-3).padStart(3, "0")
}

/** Per-file mapping: hash ref (e.g. "42:a3f") → line content */
const fileHashes = new Map<string, Map<string, string>>()

/** Track file paths for apply_patch hash invalidation across before/after hooks */
let pendingPatchFilePaths: string[] = []

interface HashlineEdit {
  filePath: string
  startHash?: string
  endHash?: string
  afterHash?: string
  content: string
}

export const HashlinePlugin: Plugin = async ({ directory }) => {
  function resolvePath(filePath: string): string {
    if (path.isAbsolute(filePath)) return path.normalize(filePath)
    return path.resolve(directory, filePath)
  }

  /** Read file from disk and compute fresh hashes */
  function computeFileHashes(filePath: string): Map<string, string> {
    const content = fs.readFileSync(filePath, "utf-8")
    const lines = content.split("\n")
    const hashes = new Map<string, string>()
    for (let i = 0; i < lines.length; i++) {
      const hash = hashLine(lines[i])
      hashes.set(`${i + 1}:${hash}`, lines[i])
    }
    fileHashes.set(filePath, hashes)
    return hashes
  }

  /** Get line content by line number from hash map */
  function getLineByNumber(
    hashes: Map<string, string>,
    lineNum: number,
  ): string | undefined {
    for (const [ref, content] of hashes) {
      if (ref.startsWith(`${lineNum}:`)) return content
    }
    return undefined
  }

  /** Validate a hash reference exists, re-reading file once if stale */
  function validateHash(
    filePath: string,
    hashRef: string,
    hashes: Map<string, string>,
  ): Map<string, string> {
    if (hashes.has(hashRef)) return hashes
    try {
      hashes = computeFileHashes(filePath)
    } catch {
      throw new Error(
        `Cannot read file "${filePath}" to verify hash references.`,
      )
    }
    if (!hashes.has(hashRef)) {
      fileHashes.delete(filePath)
      throw new Error(
        `Hash reference "${hashRef}" not found. The file may have changed since last read. Please re-read the file.`,
      )
    }
    return hashes
  }

  /** Ensure hashes exist for a file, computing them if needed */
  function ensureHashes(filePath: string): Map<string, string> | undefined {
    let hashes = fileHashes.get(filePath)
    if (!hashes) {
      try {
        hashes = computeFileHashes(filePath)
      } catch {
        return undefined
      }
    }
    return hashes
  }

  /** Collect old lines from a line range, throwing if any are missing */
  function collectRange(
    filePath: string,
    hashes: Map<string, string>,
    startLine: number,
    endLine: number,
  ): string[] {
    const lines: string[] = []
    for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
      const content = getLineByNumber(hashes, lineNum)
      if (content === undefined) {
        fileHashes.delete(filePath)
        throw new Error(
          `No hash found for line ${lineNum} in range ${startLine}-${endLine}. The file may have changed. Please re-read the file.`,
        )
      }
      lines.push(content)
    }
    return lines
  }

  /** Generate patch @@ chunk lines for a single hashline edit */
  function generatePatchChunk(
    filePath: string,
    edit: HashlineEdit,
    hashes: Map<string, string>,
  ): string[] {
    const chunk: string[] = []

    if (edit.afterHash) {
      hashes = validateHash(filePath, edit.afterHash, hashes)
      const anchorContent = hashes.get(edit.afterHash)!
      const anchorLine = parseInt(edit.afterHash.split(":")[0], 10)
      const ctx =
        anchorLine > 1
          ? (getLineByNumber(hashes, anchorLine - 1) ?? "")
          : ""
      chunk.push(`@@ ${ctx}`)
      chunk.push(` ${anchorContent}`)
      for (const line of edit.content.split("\n")) {
        chunk.push(`+${line}`)
      }
    } else if (edit.startHash) {
      hashes = validateHash(filePath, edit.startHash, hashes)
      if (edit.endHash) {
        hashes = validateHash(filePath, edit.endHash, hashes)
      }

      const startLine = parseInt(edit.startHash.split(":")[0], 10)
      const endLine = edit.endHash
        ? parseInt(edit.endHash.split(":")[0], 10)
        : startLine

      if (endLine < startLine) {
        throw new Error(
          `endHash line (${endLine}) must be >= startHash line (${startLine})`,
        )
      }

      const ctx =
        startLine > 1
          ? (getLineByNumber(hashes, startLine - 1) ?? "")
          : ""
      chunk.push(`@@ ${ctx}`)

      const oldLines = collectRange(filePath, hashes, startLine, endLine)
      for (const line of oldLines) {
        chunk.push(`-${line}`)
      }
      for (const line of edit.content.split("\n")) {
        chunk.push(`+${line}`)
      }
    }

    return chunk
  }

  /** Build hashline parameter schema for edit (single file) */
  const editParams = z.object({
    filePath: z
      .string()
      .describe("The absolute path to the file to modify"),
    startHash: z
      .string()
      .optional()
      .describe(
        'Hash reference for the start line to replace (e.g. "42:a3f")',
      ),
    endHash: z
      .string()
      .optional()
      .describe(
        "Hash reference for the end line (for multi-line range replacement)",
      ),
    afterHash: z
      .string()
      .optional()
      .describe(
        "Hash reference for the line to insert after (no replacement)",
      ),
    content: z
      .string()
      .describe("The new content to insert or replace with"),
  })

  /** Build hashline parameter schema for apply_patch (multi-file) */
  const patchParams = z.object({
    edits: z
      .array(
        z.object({
          filePath: z
            .string()
            .describe("The absolute path to the file to modify"),
          startHash: z
            .string()
            .optional()
            .describe(
              'Hash reference for the start line to replace (e.g. "42:a3f")',
            ),
          endHash: z
            .string()
            .optional()
            .describe(
              "Hash reference for the end line (for multi-line range replacement)",
            ),
          afterHash: z
            .string()
            .optional()
            .describe(
              "Hash reference for the line to insert after (no replacement)",
            ),
          content: z
            .string()
            .describe("The new content to insert or replace with"),
        }),
      )
      .describe("Array of edits to apply. Multiple files and multiple edits per file are supported."),
  })

  const editDescription = [
    "Edit a file using hashline references from the most recent read output.",
    "Each line is tagged as `<line>:<hash>| <content>`.",
    "",
    "Three operations:",
    "1. Replace line:  startHash only → replaces that single line",
    "2. Replace range: startHash + endHash → replaces all lines in range",
    "3. Insert after:  afterHash → inserts content after that line (no replacement)",
  ].join("\n")

  const patchDescription = [
    "Edit one or more files using hashline references from read output.",
    "Each line is tagged as `<line>:<hash>| <content>`.",
    "Pass an `edits` array — multiple files and multiple edits per file are supported.",
    "",
    "Three operations per edit:",
    "1. Replace line:  startHash only → replaces that single line",
    "2. Replace range: startHash + endHash → replaces all lines in range",
    "3. Insert after:  afterHash → inserts content after that line (no replacement)",
  ].join("\n")

  return {
    // ── Read: tag each line with its content hash ──────────────────────
    "tool.execute.after": async (input, output) => {
      if (input.tool === "edit") {
        const filePath = resolvePath(input.args.filePath)
        fileHashes.delete(filePath)
        return
      }

      if (input.tool === "apply_patch") {
        for (const fp of pendingPatchFilePaths) {
          fileHashes.delete(fp)
        }
        pendingPatchFilePaths = []
        return
      }

      if (input.tool !== "read") return

      // Skip directory reads
      if (output.output.includes("<type>directory</type>")) return

      // Extract absolute file path from output and normalize it
      const pathMatch = output.output.match(/<path>(.+?)<\/path>/)
      if (!pathMatch) return
      const filePath = path.normalize(pathMatch[1])

      // Transform content lines: "N: content" → "N:hash| content"
      // The first line is concatenated with <content> (no newline), so we
      // match an optional <content> prefix and preserve it in the output.
      const hashes = new Map<string, string>()
      output.output = output.output.replace(
        /^(<content>)?(\d+): (.*)$/gm,
        (
          _match,
          prefix: string | undefined,
          lineNum: string,
          content: string,
        ) => {
          const hash = hashLine(content)
          const ref = `${lineNum}:${hash}`
          hashes.set(ref, content)
          return `${prefix ?? ""}${lineNum}:${hash}| ${content}`
        },
      )

      if (hashes.size > 0) {
        // Merge with existing hashes (supports partial reads / offset reads)
        const existing = fileHashes.get(filePath)
        if (existing) {
          for (const [ref, content] of hashes) {
            existing.set(ref, content)
          }
        } else {
          fileHashes.set(filePath, hashes)
        }
      }
    },

    // ── Tool schema: replace params with hash references ─────────────
    // Requires PR #4956 (tool.definition hook) to take effect.
    // OpenCode shows `edit` for Anthropic models, `apply_patch` for Codex.
    "tool.definition": async (input: any, output: any) => {
      if (input.toolID === "edit") {
        output.description = editDescription
        output.parameters = editParams
      } else if (input.toolID === "apply_patch") {
        output.description = patchDescription
        output.parameters = patchParams
      }
    },

    // ── System prompt: instruct the model to use hashline edits ────────
    "experimental.chat.system.transform": async (_input: any, output: any) => {
      output.system.push(
        [
          "## Hashline Edit Mode (MANDATORY)",
          "",
          "When you read a file, each line is tagged with a hash: `<lineNumber>:<hash>| <content>`.",
          "You MUST use these hash references when editing files. Do NOT use oldString/newString or patchText.",
          "",
          "Three operations:",
          "",
          "1. **Replace line** — replace a single line:",
          '   `startHash: "3:cc7", content: "  \\"version\\": \\"1.0.0\\","` ',
          "",
          "2. **Replace range** — replace lines startHash through endHash:",
          '   `startHash: "3:cc7", endHash: "5:e60", content: "line3\\nline4\\nline5"`',
          "",
          "3. **Insert after** — insert new content after a line (without replacing it):",
          '   `afterHash: "3:cc7", content: "  \\"newKey\\": \\"newValue\\","` ',
          "",
          "You can edit multiple files in a single call by passing an `edits` array.",
          "Each edit specifies its own filePath and hash references.",
          "",
          "NEVER pass oldString, newString, or patchText. ALWAYS use startHash/afterHash + content.",
        ].join("\n"),
      )
    },

    // ── Edit/Patch: resolve hash references before built-in tool runs ─
    "tool.execute.before": async (input, output) => {
      // ── apply_patch: resolve hashes → generate patchText ──
      if (input.tool === "apply_patch") {
        const args = output.args

        // Raw patchText with no hashline args → let normal patch through
        if (args.patchText && !args.edits && !args.startHash && !args.afterHash)
          return

        // ── Multi-file edits array ──
        if (args.edits && Array.isArray(args.edits)) {
          // Group edits by file path (preserving order within each file)
          const editsByFile = new Map<
            string,
            { absPath: string; relPath: string; edits: HashlineEdit[] }
          >()

          for (const edit of args.edits as HashlineEdit[]) {
            const absPath = resolvePath(edit.filePath)
            let entry = editsByFile.get(absPath)
            if (!entry) {
              const relPath = path
                .relative(directory, absPath)
                .split(path.sep)
                .join("/")
              entry = { absPath, relPath, edits: [] }
              editsByFile.set(absPath, entry)
            }
            entry.edits.push(edit)
          }

          const patchLines: string[] = ["*** Begin Patch"]
          const editedPaths: string[] = []

          for (const [absPath, { relPath, edits }] of editsByFile) {
            editedPaths.push(absPath)
            let hashes = ensureHashes(absPath)
            if (!hashes) continue

            // Sort edits by line number so chunks apply top-to-bottom
            edits.sort((a, b) => {
              const lineA = parseInt(
                (a.startHash || a.afterHash || "0").split(":")[0],
                10,
              )
              const lineB = parseInt(
                (b.startHash || b.afterHash || "0").split(":")[0],
                10,
              )
              return lineA - lineB
            })

            // One *** Update File section with multiple @@ chunks
            patchLines.push(`*** Update File: ${relPath}`)

            for (const edit of edits) {
              const chunkLines = generatePatchChunk(absPath, edit, hashes)
              patchLines.push(...chunkLines)
            }
          }

          patchLines.push("*** End Patch")

          pendingPatchFilePaths = editedPaths
          args.patchText = patchLines.join("\n")
          delete args.edits
          return
        }

        // ── Single-file fallback (backwards compat) ──
        if (!args.startHash && !args.afterHash) return

        const filePath = resolvePath(args.filePath)
        pendingPatchFilePaths = [filePath]
        const relativePath = path
          .relative(directory, filePath)
          .split(path.sep)
          .join("/")

        let hashes = ensureHashes(filePath)
        if (!hashes) return

        const patchLines: string[] = [
          "*** Begin Patch",
          `*** Update File: ${relativePath}`,
        ]

        const edit: HashlineEdit = {
          filePath: args.filePath,
          startHash: args.startHash,
          endHash: args.endHash,
          afterHash: args.afterHash,
          content: args.content,
        }
        patchLines.push(...generatePatchChunk(filePath, edit, hashes))
        patchLines.push("*** End Patch")

        args.patchText = patchLines.join("\n")

        delete args.filePath
        delete args.startHash
        delete args.endHash
        delete args.afterHash
        delete args.content
        return
      }

      // ── edit: resolve hashes → oldString/newString ──
      if (input.tool !== "edit") return

      const args = output.args

      // Reject oldString edits for files we have hashes for — force hashline usage
      if (args.oldString && !args.startHash) {
        const filePath = resolvePath(args.filePath)
        if (fileHashes.has(filePath)) {
          throw new Error(
            [
              "You must use hashline references to edit this file.",
              'Use startHash (e.g. "3:cc7") instead of oldString.',
              "Refer to the hash markers from the read output.",
            ].join(" "),
          )
        }
        // No hashes for this file — allow normal edit
        return
      }

      // Only intercept hashline edits; fall through for normal edits
      if (!args.startHash && !args.afterHash) return

      // ── Insert after: append content after the referenced line ──
      if (args.afterHash) {
        const filePath = resolvePath(args.filePath)
        let hashes = ensureHashes(filePath)
        if (!hashes) return
        hashes = validateHash(filePath, args.afterHash, hashes)

        const anchorContent = hashes.get(args.afterHash)!
        args.oldString = anchorContent
        args.newString = anchorContent + "\n" + args.content

        delete args.afterHash
        delete args.content
        return
      }

      const filePath = resolvePath(args.filePath)
      let hashes = ensureHashes(filePath)
      if (!hashes) return

      // Validate startHash
      hashes = validateHash(filePath, args.startHash, hashes)

      const startLine = parseInt(args.startHash.split(":")[0], 10)
      const endLine = args.endHash
        ? parseInt(args.endHash.split(":")[0], 10)
        : startLine

      // Validate endHash
      if (args.endHash && !hashes.has(args.endHash)) {
        fileHashes.delete(filePath)
        throw new Error(
          `Hash reference "${args.endHash}" not found. The file may have changed since last read. Please re-read the file.`,
        )
      }

      if (endLine < startLine) {
        throw new Error(
          `endHash line (${endLine}) must be >= startHash line (${startLine})`,
        )
      }

      // Build oldString from the line range
      const rangeLines = collectRange(filePath, hashes, startLine, endLine)
      const oldString = rangeLines.join("\n")

      // Set resolved args for the built-in edit tool
      args.oldString = oldString
      args.newString = args.content

      // Remove hashline-specific fields so the built-in edit doesn't choke
      delete args.startHash
      delete args.endHash
      delete args.content
    },
  } as any
}

export default HashlinePlugin

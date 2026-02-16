import type { Plugin } from "@opencode-ai/plugin"
import * as fs from "fs"
import * as path from "path"
const LINE_RANGE_RE = /^(\d+)(?:\s*-\s*(\d+))?$/

export const OpenSlimeditPlugin: Plugin = async ({ directory }) => {
  function resolvePath(filePath: string): string {
    if (path.isAbsolute(filePath)) return path.normalize(filePath)
    return path.resolve(directory, filePath)
  }

  return {
    // Shorten tool descriptions + strip parameter descriptions
    "tool.definition": async (input: any, output: any) => {
      const SLIM: Record<string, string> = {
        read: "Read file content.",
        edit: "Edit file. oldString can be line range '55-64'.",
        write: "Write file.",
        bash: "Run shell command.",
        glob: "Find files.",
        grep: "Search in files.",
        list: "List directory.",
        fetch: "Fetch URL.",
      }
      if (SLIM[input.toolID]) {
        output.description = SLIM[input.toolID]
      }
    },

    // Compact tool output: shorten read paths, strip footer, compress edit results
    "tool.execute.after": async (input, output) => {
      // Compress edit output
      if (input.tool === "edit") {
        if (output.output.startsWith("Edit applied successfully.")) {
          output.output = "OK"
        }
        return
      }

      if (input.tool !== "read") return
      if (output.output.includes("<type>directory</type>")) return

      const pathMatch = output.output.match(/<path>(.+?)<\/path>/)
      if (!pathMatch) return

      // Shorten to relative path
      const absPath = path.normalize(pathMatch[1])
      const relPath = path.relative(directory, absPath)
      output.output = output.output.replace(
        `<path>${pathMatch[1]}</path>`,
        `<path>${relPath}</path>`,
      )

      // Remove type tag and footer
      output.output = output.output.replace("<type>file</type>\n", "")
      output.output = output.output.replace(
        /\n\n\(End of file - total \d+ lines\)\n/,
        "\n",
      )
    },

    // Expand line ranges in oldString
    "tool.execute.before": async (input, output) => {
      if (input.tool !== "edit") return
      const args = output.args
      if (!args.oldString || !args.filePath) return

      const filePath = resolvePath(args.filePath)
      let content: string
      try {
        content = fs.readFileSync(filePath, "utf-8")
      } catch {
        return
      }

      if (content.includes(args.oldString)) return

      const match = args.oldString.trim().match(LINE_RANGE_RE)
      if (!match) return

      const lines = content.split("\n")
      const startLine = parseInt(match[1], 10)
      const endLine = match[2] ? parseInt(match[2], 10) : startLine

      if (startLine >= 1 && endLine <= lines.length && startLine <= endLine) {
        args.oldString = lines.slice(startLine - 1, endLine).join("\n")
      }
    },
  } as any
}

export default OpenSlimeditPlugin

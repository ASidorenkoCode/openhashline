import fs from "fs"
import path from "path"

const PLUGIN_NAME = "open-hashline"

// INIT_CWD is set by npm/bun to the directory where install was run
const projectDir = process.env.INIT_CWD
if (!projectDir) {
  console.log(`  open-hashline installed. Add "${PLUGIN_NAME}" to your .opencode/opencode.json plugins array.`)
  process.exit(0)
}

const configDir = path.join(projectDir, ".opencode")
const configFile = path.join(configDir, "opencode.json")

try {
  let config = {}

  if (fs.existsSync(configFile)) {
    const raw = fs.readFileSync(configFile, "utf-8")
    config = JSON.parse(raw)
  } else {
    // Also check for opencode.jsonc
    const jsoncFile = path.join(configDir, "opencode.jsonc")
    if (fs.existsSync(jsoncFile)) {
      console.log(`  open-hashline: found opencode.jsonc — please add "${PLUGIN_NAME}" to the plugin array manually.`)
      process.exit(0)
    }
  }

  if (!Array.isArray(config.plugin)) {
    config.plugin = []
  }

  // Check if already configured (with or without version suffix)
  const alreadyExists = config.plugin.some(
    (p) => p === PLUGIN_NAME || p.startsWith(PLUGIN_NAME + "@")
  )

  if (alreadyExists) {
    console.log(`  open-hashline: already configured in ${configFile}`)
    process.exit(0)
  }

  config.plugin.push(PLUGIN_NAME)

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true })
  }

  fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + "\n")
  console.log(`  open-hashline: added to ${configFile}`)
} catch (err) {
  console.log(`  open-hashline installed. Add "${PLUGIN_NAME}" to your .opencode/opencode.json plugins array.`)
}

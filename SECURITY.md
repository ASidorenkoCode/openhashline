# Security

## Scope

open-hashline is an OpenCode plugin that transforms read output and resolves edit references. It runs in the same process as OpenCode with the same permissions.

### What this plugin does

- Reads file contents from disk to compute hashes (via `fs.readFileSync`)
- Stores line content in memory for hash resolution
- Modifies tool output (read) and tool input (edit) through hooks

### What this plugin does NOT do

- Make network requests
- Execute shell commands
- Access files beyond what OpenCode's built-in read/edit tools already access
- Persist data to disk (all state is in-memory, per-session)

## Out of Scope

The following are not considered vulnerabilities in this plugin:

- Hash collisions (by design, 3 hex chars = 4096 values; line numbers disambiguate)
- Stale hash references (handled by rejection + re-read)
- OpenCode's own security model (file access, shell execution, etc.)

## Reporting Security Issues

If you discover a security issue, please report it via [GitHub Security Advisories](https://github.com/ASidorenkoCode/openhashline/security/advisories/new) rather than opening a public issue.

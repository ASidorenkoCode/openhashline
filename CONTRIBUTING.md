# Contributing to open-hashline

Thanks for your interest in contributing! This document covers what we're looking for and how to get started.

## What we're looking for

- Bug fixes and edge case handling
- Performance improvements
- Support for additional OpenCode tool hooks
- Documentation improvements
- Test coverage

For new features or significant changes, please open an issue first to discuss the approach.

## Development Setup

### Prerequisites

- [Bun](https://bun.sh) 1.3+
- [OpenCode](https://github.com/anomalyco/opencode) with `tool.definition` hook support (PR [#4956](https://github.com/anomalyco/opencode/pull/4956))

### Getting started

```bash
git clone https://github.com/ASidorenkoCode/openhashline.git
cd openhashline
bun install
```

### Testing locally

Add the plugin to your OpenCode config (`~/.config/opencode/config.json`):

```json
{
  "plugins": {
    "hashline": {
      "module": "file:///path/to/openhashline/src/index.ts"
    }
  }
}
```

Start OpenCode and verify:

1. Read a file — lines should be tagged with `<line>:<hash>|` markers
2. Edit a file — the model should use `startHash`/`afterHash` instead of `oldString`
3. Check stale hash rejection — manually edit a file, then try a hash-based edit

## Pull Request Guidelines

### Issue first

All PRs should reference an existing issue. If there isn't one, open one first.

### PR title format

Use [conventional commits](https://www.conventionalcommits.org/):

- `fix:` — bug fix
- `feat:` — new feature
- `docs:` — documentation only
- `refactor:` — code restructuring without behavior change
- `test:` — adding or updating tests
- `chore:` — maintenance tasks

### Keep it focused

- One concern per PR
- Small, reviewable diffs
- Explain *why*, not just *what*

## Code Style

- Keep functions focused and short
- Prefer `const` over `let`
- No `any` types unless interfacing with untyped plugin APIs
- Handle edge cases explicitly (stale hashes, missing files, etc.)

## Project Structure

```
src/
└── index.ts    # Entire plugin — hooks for read, edit, and system prompt
```

The plugin is intentionally a single file. If it grows beyond ~400 lines, we can discuss splitting it.

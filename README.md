# OpenSlimedit

An [OpenCode](https://github.com/anomalyco/opencode) plugin that reduces token usage by up to 45% with zero configuration. It compresses tool descriptions, compacts read output, and adds line-range edit support.

---

## Token Savings at a Glance

```
Total tokens vs baseline (lower is better)

GPT 5.3 Codex       [================================>      ] -45.1%  saved
Claude Sonnet 4.5   [========================>              ] -32.6%  saved
GPT 5.2 Codex       [====================>                  ] -26.7%  saved
Minimax M2.5 Free   [==================>                    ] -24.8%  saved
Claude Opus 4.6     [=================>                     ] -21.8%  saved
```

| Model | Baseline | OpenSlimedit | Saved |
|---|---|---|---|
| GPT 5.3 Codex | 77,494 tokens | 42,509 tokens | **-45.1%** |
| Claude Opus 4.6 | 60,841 tokens | 47,590 tokens | **-21.8%** |
| Claude Sonnet 4.5 | 120,884 tokens | 81,471 tokens | **-32.6%** |
| GPT 5.2 Codex | 39,185 tokens | 28,713 tokens | **-26.7%** |
| Minimax M2.5 Free | 28,031 tokens | 21,073 tokens | **-24.8%** |

> Measured across 4 edit tasks (single-edit, multi-line-replace, multi-edit, large-file-edit) on small test files. Separate sessions, no prompt caching.

---

## How It Works

Three optimizations that compound across every API call:

1. **Tool description compression** — Replaces verbose built-in tool descriptions with minimal versions. Since tool schemas are sent with every API call, this saves thousands of input tokens per step.

2. **Compact read output** — Shortens absolute file paths to relative paths, strips type tags and footer boilerplate from file reads.

3. **Line-range edit expansion** — Allows the model to specify `oldString` as a line range like `"55-64"` instead of reproducing exact file content. The plugin transparently expands the range to the actual lines before the edit tool runs.

No custom tools. No system prompt injection. No modifications to built-in tool behavior. Everything works through lightweight hooks.

---

## Installation

### Prerequisites

- [OpenCode](https://github.com/anomalyco/opencode) with plugin hook support
- [Bun](https://bun.sh) runtime

### Option 1: Install from npm

```bash
npm install openslimedit
```

or with Bun:

```bash
bun add openslimedit
```

The postinstall script automatically adds the plugin to your project's `.opencode/opencode.json` config.

### Option 2: Install from source

```bash
git clone https://github.com/ASidorenkoCode/openslimedit.git
cd openslimedit
bun install
```

Then add to your OpenCode config:

```json
{
  "plugins": {
    "openslimedit": {
      "module": "file:///path/to/openslimedit/src/index.ts"
    }
  }
}
```

### Start OpenCode

```bash
opencode
```

That's it. The plugin activates automatically and reduces token usage on every interaction.

---

## Benchmark

We tested multiple approaches to find the most token-efficient editing strategy. All benchmarks run on an isolated test folder with no project context, 1 iteration per case, separate sessions to avoid prompt caching effects.

**Test cases:**
- **single-edit** — 21-line file, change one word
- **multi-line-replace** — 48-line file, rewrite a function body
- **multi-edit** — 35-line file, 3 separate changes across the file
- **large-file-edit** — 115-line file, add try/catch + retry logic

**Approaches tested:**
- **baseline** — No plugin, default OpenCode behavior
- **hashline** — Tags every line with a content hash, model references lines by hash instead of reproducing content. Custom tool schema, system prompt injection.
- **smart_edit** — Shortens descriptions of unused tools only + line-range expansion in edit. No custom tools.
- **OpenSlimedit** (current) — Aggressively shortens ALL tool descriptions + compact read output + line-range expansion. No custom tools, no system prompt.

### Why Not Hashline?

The hashline approach seemed promising in theory: tag lines with hashes so models don't need to reproduce code. In practice, it **increases** token usage for most models:

```
Total token change vs baseline (negative = savings, positive = regression)

Hashline:
  Claude Opus 4.6     ██████████████ +14.0%
  Claude Sonnet 4.5   ███████████████ +15.2%
  GPT 5.2 Codex       █████████████████████████████████████████████████ +49.9%
  Minimax M2.5 Free   █████████ +9.1%

OpenSlimedit:
  GPT 5.3 Codex       ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ -45.1%
  Claude Opus 4.6     ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ -21.8%
  Claude Sonnet 4.5   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ -32.6%
  GPT 5.2 Codex       ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ -26.7%
  Minimax M2.5 Free   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ -24.8%
```

The hash-tagged read output, custom tool schemas, and system prompt injection add per-step overhead that outweighs any savings from shorter `oldString` values. The biggest win comes from **compressing tool descriptions** — they're sent with every API call and the savings compound.

### Results — Total Tokens (% vs baseline)

#### Claude Opus 4.6

| Case | Baseline | Hashline | Smart Edit | OpenSlimedit |
|---|---|---|---|---|
| single-edit | 13,419 | 13,915 (+3.7%) | 12,739 (-5.1%) | **9,902 (-26.2%)** |
| multi-line-replace | 13,965 | 16,940 (+21.3%) | 13,289 (-4.8%) | **10,547 (-24.5%)** |
| multi-edit | 17,583 | 19,125 (+8.8%) | 16,572 (-5.7%) | **13,743 (-21.8%)** |
| large-file-edit | 15,874 | 19,377 (+22.1%) | 16,691 (+5.1%) | **13,398 (-15.6%)** |
| **Total** | **60,841** | **69,357 (+14.0%)** | **59,291 (-2.5%)** | **47,590 (-21.8%)** |

#### Claude Sonnet 4.5

| Case | Baseline | Hashline | OpenSlimedit |
|---|---|---|---|
| single-edit | 38,111 | 26,881 (-29.5%) | **18,460 (-51.6%)** |
| multi-line-replace | 26,997 | 19,039 (-29.5%) | 20,042 (-25.8%) |
| multi-edit | 39,785 | 47,923 (+20.5%) | **19,940 (-49.9%)** |
| large-file-edit | 15,991 | 45,429 (+184.1%) | 23,029 (+44.0%) |
| **Total** | **120,884** | **139,272 (+15.2%)** | **81,471 (-32.6%)** |

#### GPT 5.2 Codex

| Case | Baseline | Hashline | OpenSlimedit |
|---|---|---|---|
| single-edit | 8,002 | 11,208 (+40.1%) | 14,027 (+75.3%) |
| multi-line-replace | 8,325 | 19,350 (+132.4%) | **7,019 (-15.7%)** |
| multi-edit | 9,510 | FAIL | **4,797 (-49.5%)** |
| large-file-edit | 13,348 | 8,189 (-38.6%) | **2,870 (-78.5%)** |
| **Total** | **39,185** | **58,747*** | **28,713 (-26.7%)** |

*\*Hashline multi-edit failed (760s timeout loop); total includes failed run*

#### GPT 5.3 Codex

| Case | Baseline | OpenSlimedit |
|---|---|---|
| single-edit | 10,445 | **10,402 (-0.4%)** |
| multi-line-replace | 20,468 | **11,312 (-44.7%)** |
| multi-edit | 21,299 | **6,068 (-71.5%)** |
| large-file-edit | 25,282 | **14,727 (-41.8%)** |
| **Total** | **77,494** | **42,509 (-45.1%)** |

#### Minimax M2.5 Free

| Case | Baseline | Hashline | Smart Edit | OpenSlimedit |
|---|---|---|---|---|
| single-edit | 10,691 | 11,098 (+3.8%) | 9,994 (-6.5%) | **7,405 (-30.7%)** |
| multi-line-replace | 11,105 | 12,045 (+8.5%) | 10,396 (-6.4%) | **1,721 (-84.5%)** |
| multi-edit | 2,308 | 2,331 (+1.0%) | 2,357 (+2.1%) | 8,034 (+248.1%) |
| large-file-edit | 3,927 | 5,100 (+29.9%) | 3,986 (+1.5%) | **3,913 (-0.4%)** |
| **Total** | **28,031** | **30,574 (+9.1%)** | **26,733 (-4.6%)** | **21,073 (-24.8%)** |

### Summary

| Model | Hashline | Smart Edit | OpenSlimedit |
|---|---|---|---|
| **GPT 5.3 Codex** | — | — | **-45.1%** |
| **Claude Opus 4.6** | +14.0% | -2.5% | **-21.8%** |
| **Claude Sonnet 4.5** | +15.2% | — | **-32.6%** |
| **GPT 5.2 Codex** | +49.9%* | — | **-26.7%** |
| **Minimax M2.5 Free** | +9.1% | -4.6% | **-24.8%** |

*\*Includes failed multi-edit run*

### Large File Scaling

The benchmarks above use small files (21-115 lines). How does OpenSlimedit perform on real-world file sizes?

#### Minimax M2.5 Free

| File Size | Baseline | OpenSlimedit | Saved |
|---|---|---|---|
| 1k lines | 37,743 | 30,697 | **-18.7%** |
| 3k lines | 29,021 | 25,832 | **-11.0%** |
| 6k lines | 29,422 | 25,747 | **-12.5%** |
| 10k lines | 29,405 | 25,742 | **-12.5%** |

#### GPT 5.3 Codex

| File Size | Baseline | OpenSlimedit | Saved |
|---|---|---|---|
| 1k lines | 15,000 | 22,034 | +46.9% |
| 3k lines | 38,712 | 28,686 | **-25.9%** |
| 6k lines | 29,697 | 32,635 | +9.9% |
| 10k lines | 28,136 | 28,162 | +0.1% |

Minimax shows consistent savings (11-19%) at all file sizes. GPT 5.3 Codex results are mixed on large files — significant savings at 3k lines but regressions at 1k and 6k. With large files, the file content dominates the token count and tool description compression is a smaller proportion of the total.

### Key Findings

- **Tool description compression is the biggest win.** Tool schemas are sent with every API call. Shortening them saves thousands of input tokens per step, and this compounds across multi-step tasks.
- **Hashline increases token usage for most models.** The hash-tagged read output, custom tool schemas, and system prompt injection add per-step overhead that outweighs the savings from shorter `oldString` values.
- **OpenSlimedit consistently saves 11-45% across all tested models and file sizes** with zero regressions on Opus 4.6. GPT 5.3 Codex shows the largest savings at 45.1%. Some models show regressions on individual cases (Minimax on multi-edit, Codex 5.2 on single-edit) but the total is always significantly lower.
- **Custom tools confuse some models.** Minimax and Codex struggle with non-standard tool schemas, leading to extra steps or failures. OpenSlimedit avoids this entirely by only modifying descriptions of existing tools.

<details>
<summary>Raw data — Hashline runs</summary>

| Mode | Model | Case | Time | Input | Output | Total | Success |
|---|---|---|---|---|---|---|---|
| hashline | claude-sonnet-4.5 | single-edit | 10,745 ms | 26,582 | 299 | 26,881 | yes |
| hashline | claude-sonnet-4.5 | multi-line-replace | 37,231 ms | 17,188 | 1,851 | 19,039 | yes |
| hashline | claude-sonnet-4.5 | multi-edit | 52,668 ms | 44,604 | 3,319 | 47,923 | yes |
| hashline | claude-sonnet-4.5 | large-file-edit | 25,097 ms | 44,466 | 963 | 45,429 | yes |
| hashline | claude-opus-4.6 | single-edit | 12,994 ms | 13,617 | 298 | 13,915 | yes |
| hashline | claude-opus-4.6 | multi-line-replace | 21,080 ms | 16,208 | 732 | 16,940 | yes |
| hashline | claude-opus-4.6 | multi-edit | 46,637 ms | 17,031 | 2,094 | 19,125 | yes |
| hashline | claude-opus-4.6 | large-file-edit | 25,787 ms | 18,401 | 976 | 19,377 | yes |
| hashline | gpt-5.2-codex | single-edit | 12,458 ms | 10,929 | 279 | 11,208 | yes |
| hashline | gpt-5.2-codex | multi-line-replace | 24,931 ms | 18,381 | 969 | 19,350 | yes |
| hashline | gpt-5.2-codex | multi-edit | 760,890 ms | 146,516 | 53,250 | 199,766 | **no** |
| hashline | gpt-5.2-codex | large-file-edit | 27,601 ms | 6,979 | 1,210 | 8,189 | yes |
| hashline | minimax-m2.5-free | single-edit | 13,806 ms | 10,680 | 418 | 11,098 | yes |
| hashline | minimax-m2.5-free | multi-line-replace | 56,046 ms | 11,082 | 963 | 12,045 | yes |
| hashline | minimax-m2.5-free | multi-edit | 19,062 ms | 1,654 | 677 | 2,331 | yes |
| hashline | minimax-m2.5-free | large-file-edit | 61,973 ms | 3,222 | 1,878 | 5,100 | yes |

</details>

<details>
<summary>Raw data — Baseline runs</summary>

| Mode | Model | Case | Time | Input | Output | Total | Success |
|---|---|---|---|---|---|---|---|
| baseline | claude-sonnet-4.5 | single-edit | 11,107 ms | 37,775 | 336 | 38,111 | yes |
| baseline | claude-sonnet-4.5 | multi-line-replace | 12,876 ms | 26,541 | 456 | 26,997 | yes |
| baseline | claude-sonnet-4.5 | multi-edit | 17,343 ms | 38,890 | 895 | 39,785 | yes |
| baseline | claude-sonnet-4.5 | large-file-edit | 21,273 ms | 15,035 | 956 | 15,991 | yes |
| baseline | claude-opus-4.6 | single-edit | 12,464 ms | 13,146 | 273 | 13,419 | yes |
| baseline | claude-opus-4.6 | multi-line-replace | 14,016 ms | 13,554 | 411 | 13,965 | yes |
| baseline | claude-opus-4.6 | multi-edit | 43,656 ms | 15,873 | 1,710 | 17,583 | yes |
| baseline | claude-opus-4.6 | large-file-edit | 20,120 ms | 14,981 | 893 | 15,874 | yes |
| baseline | gpt-5.2-codex | single-edit | 11,662 ms | 7,656 | 346 | 8,002 | yes |
| baseline | gpt-5.2-codex | multi-line-replace | 11,922 ms | 8,039 | 286 | 8,325 | yes |
| baseline | gpt-5.2-codex | multi-edit | 22,087 ms | 8,519 | 991 | 9,510 | yes |
| baseline | gpt-5.2-codex | large-file-edit | 29,591 ms | 11,701 | 1,647 | 13,348 | yes |
| baseline | minimax-m2.5-free | single-edit | 10,740 ms | 10,389 | 302 | 10,691 | yes |
| baseline | minimax-m2.5-free | multi-line-replace | 16,274 ms | 10,668 | 437 | 11,105 | yes |
| baseline | minimax-m2.5-free | multi-edit | 43,462 ms | 1,233 | 1,075 | 2,308 | yes |
| baseline | minimax-m2.5-free | large-file-edit | 20,430 ms | 3,250 | 677 | 3,927 | yes |
| baseline | gpt-5.3-codex | single-edit | 12,075 ms | 10,218 | 227 | 10,445 | yes |
| baseline | gpt-5.3-codex | multi-line-replace | 22,378 ms | 20,110 | 358 | 20,468 | yes |
| baseline | gpt-5.3-codex | multi-edit | 17,870 ms | 20,723 | 576 | 21,299 | yes |
| baseline | gpt-5.3-codex | large-file-edit | 22,028 ms | 24,384 | 898 | 25,282 | yes |

</details>

<details>
<summary>Raw data — Smart Edit runs</summary>

| Mode | Model | Case | Time | Input | Output | Total | Success |
|---|---|---|---|---|---|---|---|
| smart_edit | claude-opus-4.6 | single-edit | 13,016 ms | 12,432 | 307 | 12,739 | yes |
| smart_edit | claude-opus-4.6 | multi-line-replace | 15,812 ms | 12,847 | 442 | 13,289 | yes |
| smart_edit | claude-opus-4.6 | multi-edit | 40,820 ms | 14,919 | 1,653 | 16,572 | yes |
| smart_edit | claude-opus-4.6 | large-file-edit | 32,170 ms | 15,377 | 1,314 | 16,691 | yes |
| smart_edit | minimax-m2.5-free | single-edit | 11,149 ms | 9,707 | 287 | 9,994 | yes |
| smart_edit | minimax-m2.5-free | multi-line-replace | 21,405 ms | 9,992 | 404 | 10,396 | yes |
| smart_edit | minimax-m2.5-free | multi-edit | 20,998 ms | 1,377 | 980 | 2,357 | yes |
| smart_edit | minimax-m2.5-free | large-file-edit | 41,250 ms | 3,212 | 774 | 3,986 | yes |

</details>

<details>
<summary>Raw data — OpenSlimedit runs</summary>

| Mode | Model | Case | Time | Input | Output | Total | Success |
|---|---|---|---|---|---|---|---|
| openslimedit | claude-opus-4.6 | single-edit | 12,126 ms | 9,629 | 273 | 9,902 | yes |
| openslimedit | claude-opus-4.6 | multi-line-replace | 15,326 ms | 10,066 | 481 | 10,547 | yes |
| openslimedit | claude-opus-4.6 | multi-edit | 41,378 ms | 12,095 | 1,648 | 13,743 | yes |
| openslimedit | claude-opus-4.6 | large-file-edit | 28,135 ms | 12,161 | 1,237 | 13,398 | yes |
| openslimedit | claude-sonnet-4.5 | single-edit | 10,884 ms | 18,148 | 312 | 18,460 | yes |
| openslimedit | claude-sonnet-4.5 | multi-line-replace | 13,208 ms | 19,528 | 514 | 20,042 | yes |
| openslimedit | claude-sonnet-4.5 | multi-edit | 20,895 ms | 18,985 | 955 | 19,940 | yes |
| openslimedit | claude-sonnet-4.5 | large-file-edit | 20,498 ms | 22,053 | 976 | 23,029 | yes |
| openslimedit | gpt-5.2-codex | single-edit | 8,745 ms | 13,841 | 186 | 14,027 | yes |
| openslimedit | gpt-5.2-codex | multi-line-replace | 10,123 ms | 6,770 | 249 | 7,019 | yes |
| openslimedit | gpt-5.2-codex | multi-edit | 13,653 ms | 4,239 | 558 | 4,797 | yes |
| openslimedit | gpt-5.2-codex | large-file-edit | 14,786 ms | 2,206 | 664 | 2,870 | yes |
| openslimedit | minimax-m2.5-free | single-edit | 15,159 ms | 7,140 | 265 | 7,405 | yes |
| openslimedit | minimax-m2.5-free | multi-line-replace | 14,744 ms | 1,316 | 405 | 1,721 | yes |
| openslimedit | minimax-m2.5-free | multi-edit | 13,289 ms | 7,385 | 649 | 8,034 | yes |
| openslimedit | minimax-m2.5-free | large-file-edit | 21,090 ms | 3,214 | 699 | 3,913 | yes |
| openslimedit | gpt-5.3-codex | single-edit | 10,638 ms | 10,186 | 216 | 10,402 | yes |
| openslimedit | gpt-5.3-codex | multi-line-replace | 10,419 ms | 10,974 | 338 | 11,312 | yes |
| openslimedit | gpt-5.3-codex | multi-edit | 15,752 ms | 5,470 | 598 | 6,068 | yes |
| openslimedit | gpt-5.3-codex | large-file-edit | 28,453 ms | 13,359 | 1,368 | 14,727 | yes |

</details>

<details>
<summary>Raw data — Large file scaling runs</summary>

| Mode | Model | Case | Time | Input | Output | Total | Success |
|---|---|---|---|---|---|---|---|
| baseline | minimax-m2.5-free | 1k-lines | 51,367 ms | 36,733 | 1,010 | 37,743 | yes |
| baseline | minimax-m2.5-free | 3k-lines | 39,505 ms | 28,392 | 629 | 29,021 | yes |
| baseline | minimax-m2.5-free | 6k-lines | 47,862 ms | 28,398 | 1,024 | 29,422 | yes |
| baseline | minimax-m2.5-free | 10k-lines | 40,794 ms | 28,523 | 882 | 29,405 | yes |
| openslimedit | minimax-m2.5-free | 1k-lines | 25,237 ms | 29,788 | 909 | 30,697 | yes |
| openslimedit | minimax-m2.5-free | 3k-lines | 45,621 ms | 25,247 | 585 | 25,832 | yes |
| openslimedit | minimax-m2.5-free | 6k-lines | 33,315 ms | 25,158 | 589 | 25,747 | yes |
| openslimedit | minimax-m2.5-free | 10k-lines | 19,114 ms | 25,173 | 569 | 25,742 | yes |
| baseline | gpt-5.3-codex | 1k-lines | 21,304 ms | 13,946 | 1,054 | 15,000 | yes |
| baseline | gpt-5.3-codex | 3k-lines | 25,549 ms | 37,555 | 1,157 | 38,712 | yes |
| baseline | gpt-5.3-codex | 6k-lines | 29,642 ms | 28,402 | 1,295 | 29,697 | yes |
| baseline | gpt-5.3-codex | 10k-lines | 21,031 ms | 27,148 | 988 | 28,136 | yes |
| openslimedit | gpt-5.3-codex | 1k-lines | 25,150 ms | 20,806 | 1,228 | 22,034 | yes |
| openslimedit | gpt-5.3-codex | 3k-lines | 29,513 ms | 27,556 | 1,130 | 28,686 | yes |
| openslimedit | gpt-5.3-codex | 6k-lines | 32,021 ms | 31,320 | 1,315 | 32,635 | yes |
| openslimedit | gpt-5.3-codex | 10k-lines | 21,321 ms | 27,073 | 1,089 | 28,162 | yes |

</details>

---

## Project Structure

```
openslimedit/
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

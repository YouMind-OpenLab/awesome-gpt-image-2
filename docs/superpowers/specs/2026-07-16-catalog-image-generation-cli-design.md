# Catalog-Linked Image Generation CLI — Design

**Date:** 2026-07-16
**Status:** Approved (pending spec review)

## Purpose

This repository is a curated catalog of GPT Image 2 prompts. Prompts live in a
Payload CMS and are rendered into multilingual README files. Today there is no
way to actually generate an image from a catalog prompt.

This feature adds a CLI that takes a catalog prompt (by CMS id), sends its
prompt text to OpenAI's `gpt-image-2` model, and saves the resulting image
locally.

## Scope

### In scope (v1)
- `pnpm run image --id <id>` — fetch a prompt from the CMS by id and generate an image.
- `pnpm run image --list` — list available prompts (id + title) to discover ids.
- Text-to-image generation only, via `openai.images.generate`.
- Model fixed to `gpt-image-2`.
- Uses `OPENAI_API_KEY`, `CMS_HOST`, `CMS_API_KEY` from `.env`.
- Save images under `output/` (git-ignored).

### Out of scope (YAGNI for v1)
- Image editing / reference-image input (`openai.images.edit`).
- Web UI.
- Integration into the README generation pipeline.
- Batch generation of the entire catalog.

## Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Delivery form | Catalog-linked CLI |
| Prompt source | Live fetch from CMS (reuse `cms-client.ts`) |
| Model | `gpt-image-2` (hardcoded) |
| Credentials | `OPENAI_API_KEY` from `.env` |
| `needReferenceImages: true` prompts | Warn and abort (v1 does not support reference images) |

## Architecture

### New files

| File | Responsibility |
|---|---|
| `scripts/generate-image.ts` | CLI entry point: parse args → fetch prompt → generate → save. |
| `scripts/utils/image-generator.ts` | Thin wrapper over `openai.images.generate`. Input: prompt text + options. Output: array of image buffers. |
| `scripts/utils/prompt-preparer.ts` | Pure functions: clean prompt content, detect/substitute `{argument}` placeholders, build output filename slug. Unit-tested. |
| `scripts/utils/prompt-preparer.test.ts` | `node:test` unit tests for the pure functions. |

### Changed files

| File | Change |
|---|---|
| `scripts/utils/cms-client.ts` | Add `fetchPromptById(id, locale)` using `GET /api/prompts/:id`. |
| `package.json` | Add script `"image"`, script `"test"`, and dependency `openai`. |
| `.gitignore` | Add `output/`. |

### Module boundaries

- `prompt-preparer.ts` is pure (no network, no fs) so it is independently testable.
- `image-generator.ts` isolates the OpenAI SDK so the CLI does not depend on SDK
  shape directly and the SDK can be mocked in tests.
- `cms-client.ts` remains the single place that knows the CMS REST shape.

## CLI interface

```
pnpm run image --id <id> [options]
pnpm run image --list [--limit 50]

options:
  --id <number>     CMS prompt id (the number in README "?id=" links)
  --list            List available prompts (id, title, markers) and exit
  --limit <n>       Max rows for --list (default 50)
  --lang <locale>   Use translatedContent for this locale (default: original `content`)
  --size <size>     Image size (default 1024x1024)
  --quality <q>     low | medium | high | auto (default auto)
  --n <count>       Number of images to generate (default 1)
  --out <dir>       Output directory (default output/)
  --format <fmt>    png | webp | jpeg (default png)
  --arg <text>      Text to substitute into {argument...} placeholders
```

## Generation flow (`--id`)

1. Load `.env` via `dotenv/config`. Validate `OPENAI_API_KEY`, `CMS_HOST`,
   `CMS_API_KEY`. On any missing key, print a clear error and exit non-zero.
2. `fetchPromptById(id, lang)` from the CMS. On 404 / not found, print
   "prompt id=<id> not found" and exit non-zero.
3. If `needReferenceImages === true`: print a warning that the prompt requires
   an input image (unsupported in v1) and exit non-zero.
4. Prepare the prompt text:
   - Choose `translatedContent` if `--lang` is given and present, else `content`.
   - Strip code-block markers. `prompt-preparer.ts` gets its own
     `cleanPromptContent` (logic mirrored from `markdown-generator.ts`). The
     existing README pipeline is left untouched in v1 to avoid regressions; a
     later cleanup can DRY the two.
   - If `{argument...}` placeholders remain:
     - If `--arg <text>` is provided, replace all `{argument...}` tokens with it.
     - Otherwise print a warning that placeholders are unresolved and continue.
5. Call `image-generator.generate(promptText, { size, quality, n, format })` with
   model hardcoded to `gpt-image-2`. The result is base64 (`data[i].b64_json`),
   decoded to Buffers.
6. Write each image to `output/<id>-<title-slug>-<index>.<format>` and print the
   saved path(s).

## Generation flow (`--list`)

1. Validate `CMS_HOST` / `CMS_API_KEY`.
2. Reuse `fetchAllPrompts(lang, categories)` to gather prompts.
3. Print a table of `id`, `title`, and markers (`⭐` featured,
   `🖼️` needReferenceImages) up to `--limit`.

## Error handling

- Missing env var → explicit message naming the variable; exit 1.
- CMS non-2xx → surface status + which id/endpoint failed.
- OpenAI errors (model unavailable, moderation block, rate limit) → catch, print
  the API message, exit 1. Do not print the API key.
- Unresolved `{argument}` placeholders → warning, not fatal (image still attempted).

## Testing

The repo currently has no test runner. Use Node's built-in `node:test` run via
`tsx` — no new test-framework dependency.

- `package.json`: `"test": "tsx --test scripts/**/*.test.ts"`.
- `prompt-preparer.test.ts` covers:
  - `cleanPromptContent`: strips ` ``` ` / ` ```json ` fences, trims.
  - argument detection: true when `{argument` present, false otherwise.
  - argument substitution: `--arg` text replaces all `{argument...}` tokens.
  - slug builder: title → filesystem-safe slug (lowercase, hyphenated, truncated).
- Network layers (`cms-client`, `image-generator`) are not unit-tested in v1;
  they are exercised by a manual end-to-end run (`pnpm run image --list`, then
  `pnpm run image --id <id>`) documented in the plan.

## Verification (manual, end-to-end)

1. `pnpm install` (adds `openai`).
2. `pnpm test` — pure-function tests pass.
3. `pnpm run image --list` — prints prompts from the CMS.
4. `pnpm run image --id <id>` on a text-to-image prompt — writes a PNG to `output/`.
5. `pnpm run image --id <id>` on a `needReferenceImages` prompt — warns and exits.

## Amendment (2026-07-16): CMS-optional paths

During end-to-end verification, `.env` was found to contain only a real
`OPENAI_API_KEY`; `CMS_HOST`/`CMS_API_KEY` were still the `.env.example`
placeholders, so the CMS-backed `--id`/`--list` paths could not reach a CMS.
Per user decision, two CMS-free paths were added so the tool is usable with just
`OPENAI_API_KEY`, while the CMS paths remain for when real credentials are set:

- `--prompt "<text>"` — generate from arbitrary free text (no CMS, no README).
- `--no <number>` — generate from a prompt parsed out of the local README by its
  "No." heading (no CMS). Added `scripts/utils/readme-parser.ts`
  (`parseReadmePrompts`, `getReadmePromptByNo`) with unit tests.
- `--readme-list` — list prompts parsed from the README.

Routing precedence in the CLI: `--prompt` → `--no` → `--readme-list` →
`--list` → `--id` → usage. The `gpt-image-2` model, output handling, and
`needReferenceImages` behavior are unchanged.

## Open questions

None. All brainstorming decisions resolved.

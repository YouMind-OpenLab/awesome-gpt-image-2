# Catalog-Linked Image Generation CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a CLI that fetches a catalog prompt from the CMS by id and generates an image with OpenAI `gpt-image-2`, saving it locally.

**Architecture:** A thin CLI (`scripts/generate-image.ts`) parses args, fetches the prompt via the existing `cms-client.ts` (new `fetchPromptById`), prepares the prompt text with pure helpers (`prompt-preparer.ts`), and calls an OpenAI wrapper (`image-generator.ts`) that returns decoded image buffers written under `output/`.

**Tech Stack:** Node 20+, TypeScript run via `tsx` (no build/typecheck step), ESM, pnpm, `openai` SDK, Node built-ins `node:util` (parseArgs) and `node:test`.

## Global Constraints

- Node.js 20+; package manager pnpm (`packageManager: pnpm@9.15.9`).
- ESM project (`"type": "module"`) — intra-repo imports use `.js` extensions even for `.ts` files (e.g. `./utils/cms-client.js`), matching existing code.
- Scripts run via `tsx`; there is no `tsc` build or typecheck step in CI, so type-only friction does not block runtime.
- Image model is hardcoded to `gpt-image-2`. Do not read the model from env.
- Credentials come from `.env` (loaded with `import "dotenv/config"`): `OPENAI_API_KEY`, `CMS_HOST`, `CMS_API_KEY`.
- Never print the API key in logs or errors.
- No source files in the repo root — new code lives under `scripts/`. Generated images go under `output/` (git-ignored).
- CMS auth header format (existing): `Authorization: users API-Key ${CMS_API_KEY}`.

---

## File Structure

| File | Responsibility |
|---|---|
| `scripts/utils/prompt-preparer.ts` (create) | Pure functions: clean prompt content, detect/substitute `{argument}` placeholders, slugify, build output filename. |
| `scripts/utils/prompt-preparer.test.ts` (create) | `node:test` unit tests for the pure functions. |
| `scripts/utils/cms-client.ts` (modify) | Add `fetchPromptById(id, locale)`. |
| `scripts/utils/image-generator.ts` (create) | Wrapper over `openai.images.generate` → `Buffer[]`. |
| `scripts/generate-image.ts` (create) | CLI entry point wiring the above. |
| `package.json` (modify) | Add `image` + `test` scripts and `openai` dependency. |
| `.gitignore` (modify) | Add `output/`. |

---

### Task 1: Pure prompt-preparation helpers (TDD)

**Files:**
- Create: `scripts/utils/prompt-preparer.ts`
- Test: `scripts/utils/prompt-preparer.test.ts`
- Modify: `package.json` (add `test` script)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `cleanPromptContent(content: string): string`
  - `hasArguments(content: string): boolean`
  - `substituteArguments(content: string, value: string): string`
  - `slugify(title: string, maxLen?: number): string`
  - `buildImageFilename(id: number, title: string, index: number, format: string): string`

- [ ] **Step 1: Add the `test` script to `package.json`**

In `package.json`, add a `test` entry to `scripts` (keep existing `generate` and `sync`):

```json
  "scripts": {
    "generate": "tsx scripts/generate-readme.ts",
    "sync": "tsx scripts/sync-approved-to-cms.ts",
    "test": "tsx --test scripts/utils/*.test.ts"
  },
```

- [ ] **Step 2: Write the failing tests**

Create `scripts/utils/prompt-preparer.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanPromptContent,
  hasArguments,
  substituteArguments,
  slugify,
  buildImageFilename,
} from "./prompt-preparer.js";

test("cleanPromptContent strips a plain ``` fence and trims", () => {
  const input = "```\nA red cube on white\n```";
  assert.equal(cleanPromptContent(input), "A red cube on white");
});

test("cleanPromptContent strips a ```json language fence", () => {
  const input = "```json\n{\"a\":1}\n```";
  assert.equal(cleanPromptContent(input), '{"a":1}');
});

test("cleanPromptContent returns plain text unchanged (trimmed)", () => {
  assert.equal(cleanPromptContent("  hello  "), "hello");
});

test("hasArguments detects {argument tokens", () => {
  assert.equal(hasArguments("draw {argument name=\"x\"}"), true);
  assert.equal(hasArguments("draw a cat"), false);
});

test("substituteArguments replaces every {argument...} token", () => {
  const out = substituteArguments("A {argument} riding a {argument name=\"y\"}", "dog");
  assert.equal(out, "A dog riding a dog");
});

test("slugify lowercases, hyphenates, and truncates", () => {
  assert.equal(slugify("A Red Cube!! On White"), "a-red-cube-on-white");
  assert.equal(slugify("x".repeat(60), 10), "xxxxxxxxxx");
});

test("slugify falls back to 'prompt' for non-latin titles", () => {
  assert.equal(slugify("猫の宇宙飛行士"), "prompt");
});

test("buildImageFilename composes id, slug, 1-based index, and format", () => {
  assert.equal(buildImageFilename(42, "Cat Astronaut", 0, "png"), "42-cat-astronaut-1.png");
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — cannot find module `./prompt-preparer.js` (file not created yet).

- [ ] **Step 4: Write the implementation**

Create `scripts/utils/prompt-preparer.ts`:

```ts
/**
 * Remove code-block markers (``` or ```json etc.) from prompt content.
 * Mirrors the logic in markdown-generator.ts; kept separate so the README
 * pipeline stays untouched in v1.
 */
export function cleanPromptContent(content: string): string {
  if (!content) return content;
  let cleaned = content;
  cleaned = cleaned.replace(/^```[\w-]*\s*\n?/im, "");
  cleaned = cleaned.replace(/\n?```\s*$/im, "");
  cleaned = cleaned.replace(/\n```[\w-]*\s*\n/g, "\n");
  return cleaned.trim();
}

/** True when the prompt still contains Raycast-style {argument...} placeholders. */
export function hasArguments(content: string): boolean {
  return content.includes("{argument");
}

/** Replace every {argument...} token with the provided value. */
export function substituteArguments(content: string, value: string): string {
  return content.replace(/\{argument[^}]*\}/g, value);
}

/** Filesystem-safe slug from a title. Falls back to "prompt" when empty. */
export function slugify(title: string, maxLen = 40): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.slice(0, maxLen).replace(/-+$/g, "") || "prompt";
}

/** Build an output filename like `42-cat-astronaut-1.png` (index is 0-based). */
export function buildImageFilename(
  id: number,
  title: string,
  index: number,
  format: string
): string {
  return `${id}-${slugify(title)}-${index + 1}.${format}`;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS — all 8 tests pass.

- [ ] **Step 6: Commit**

```bash
git add scripts/utils/prompt-preparer.ts scripts/utils/prompt-preparer.test.ts package.json
git commit -m "feat: add pure prompt-preparation helpers with tests"
```

---

### Task 2: `fetchPromptById` in cms-client

**Files:**
- Modify: `scripts/utils/cms-client.ts`

**Interfaces:**
- Consumes: existing `Prompt` interface, `processPromptImages` (private, same file), `CMS_HOST`, `CMS_API_KEY`.
- Produces: `fetchPromptById(id: number | string, locale?: string): Promise<Prompt | null>` — returns the prompt with `sourceMedia` populated, or `null` on 404.

- [ ] **Step 1: Add the function**

In `scripts/utils/cms-client.ts`, add after `findPromptByGitHubIssue` (it relies on `processPromptImages`, `CMS_HOST`, `CMS_API_KEY`, `fetch`, and `stringify`, all already in this file):

```ts
/**
 * Fetch a single prompt by its CMS id.
 * Returns null when the prompt does not exist (HTTP 404).
 */
export async function fetchPromptById(
  id: number | string,
  locale: string = "en"
): Promise<Prompt | null> {
  const query = { depth: 2, locale };
  const stringifiedQuery = stringify(query, { addQueryPrefix: true });
  const url = `${CMS_HOST}/api/prompts/${id}${stringifiedQuery}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `users API-Key ${CMS_API_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(
      `CMS API error (${response.status}) fetching prompt ${id}: ${response.statusText}`
    );
  }

  const data = (await response.json()) as Prompt;
  return processPromptImages(data);
}
```

- [ ] **Step 2: Typecheck-free sanity run**

Run: `pnpm exec tsx -e "import('./scripts/utils/cms-client.ts').then(m => console.log(typeof m.fetchPromptById))"`
Expected: prints `function` (module loads, export exists). No network call is made.

- [ ] **Step 3: Commit**

```bash
git add scripts/utils/cms-client.ts
git commit -m "feat: add fetchPromptById to cms-client"
```

---

### Task 3: OpenAI image-generator wrapper

**Files:**
- Create: `scripts/utils/image-generator.ts`
- Modify: `package.json` (add `openai` dependency via install)

**Interfaces:**
- Consumes: `process.env.OPENAI_API_KEY`, the `openai` SDK.
- Produces:
  - types `ImageQuality = "low" | "medium" | "high" | "auto"`, `ImageFormat = "png" | "webp" | "jpeg"`, `GenerateOptions`
  - `generateImages(prompt: string, opts?: GenerateOptions): Promise<Buffer[]>`

- [ ] **Step 1: Install the OpenAI SDK**

Run: `pnpm add openai`
Expected: `openai` added to `dependencies` in `package.json` and `pnpm-lock.yaml` updated.

- [ ] **Step 2: Write the wrapper**

Create `scripts/utils/image-generator.ts`:

```ts
import OpenAI from "openai";

export type ImageQuality = "low" | "medium" | "high" | "auto";
export type ImageFormat = "png" | "webp" | "jpeg";

export interface GenerateOptions {
  size?: string;
  quality?: ImageQuality;
  n?: number;
  format?: ImageFormat;
}

const MODEL = "gpt-image-2";

/**
 * Generate images from a text prompt with gpt-image-2.
 * gpt-image models always return base64, so each image is decoded to a Buffer.
 */
export async function generateImages(
  prompt: string,
  opts: GenerateOptions = {}
): Promise<Buffer[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const client = new OpenAI({ apiKey });

  // tsx strips types at runtime, so passing gpt-image-2 params the installed
  // SDK types may not know about (e.g. output_format) is safe.
  const result = await client.images.generate({
    model: MODEL,
    prompt,
    size: opts.size ?? "1024x1024",
    quality: opts.quality ?? "auto",
    n: opts.n ?? 1,
    output_format: opts.format ?? "png",
  } as OpenAI.ImageGenerateParams);

  const data = result.data ?? [];
  if (data.length === 0) {
    throw new Error("Image API returned no images");
  }

  return data.map((img) => {
    if (!img.b64_json) {
      throw new Error("Image API response missing b64_json");
    }
    return Buffer.from(img.b64_json, "base64");
  });
}
```

- [ ] **Step 3: Module-load sanity run**

Run: `pnpm exec tsx -e "import('./scripts/utils/image-generator.ts').then(m => console.log(typeof m.generateImages))"`
Expected: prints `function`. No API call is made.

- [ ] **Step 4: Commit**

```bash
git add scripts/utils/image-generator.ts package.json pnpm-lock.yaml
git commit -m "feat: add openai image-generator wrapper"
```

---

### Task 4: CLI entry point + gitignore

**Files:**
- Create: `scripts/generate-image.ts`
- Modify: `package.json` (add `image` script)
- Modify: `.gitignore` (add `output/`)

**Interfaces:**
- Consumes: `fetchPromptById`, `fetchAllPrompts`, `fetchPromptCategories` (cms-client); `generateImages`, `ImageQuality`, `ImageFormat` (image-generator); `cleanPromptContent`, `hasArguments`, `substituteArguments`, `buildImageFilename` (prompt-preparer).
- Produces: the `pnpm run image` command.

- [ ] **Step 1: Ignore the output directory**

In `.gitignore`, add a line:

```
output/
```

- [ ] **Step 2: Add the `image` script to `package.json`**

In `package.json` `scripts`, add:

```json
    "image": "tsx scripts/generate-image.ts",
```

Resulting `scripts` block:

```json
  "scripts": {
    "generate": "tsx scripts/generate-readme.ts",
    "sync": "tsx scripts/sync-approved-to-cms.ts",
    "image": "tsx scripts/generate-image.ts",
    "test": "tsx --test scripts/utils/*.test.ts"
  },
```

- [ ] **Step 3: Write the CLI**

Create `scripts/generate-image.ts`:

```ts
import "dotenv/config";
import fs from "fs";
import path from "path";
import { parseArgs } from "node:util";
import {
  fetchPromptById,
  fetchAllPrompts,
  fetchPromptCategories,
} from "./utils/cms-client.js";
import {
  generateImages,
  type ImageQuality,
  type ImageFormat,
} from "./utils/image-generator.js";
import {
  cleanPromptContent,
  hasArguments,
  substituteArguments,
  buildImageFilename,
} from "./utils/prompt-preparer.js";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`❌ Environment variable ${name} is not set. Add it to .env`);
    process.exit(1);
  }
  return v;
}

async function runList(lang: string, limit: number): Promise<void> {
  requireEnv("CMS_HOST");
  requireEnv("CMS_API_KEY");

  const { allCategories } = await fetchPromptCategories(lang);
  const { docs } = await fetchAllPrompts(lang, allCategories);

  console.log(`\nAvailable prompts (${Math.min(limit, docs.length)} of ${docs.length}):\n`);
  docs.slice(0, limit).forEach((p) => {
    const marks = `${p.featured ? "⭐" : ""}${p.needReferenceImages ? "🖼️" : ""}`;
    console.log(`  ${String(p.id).padStart(5)}  ${marks ? marks + " " : ""}${p.title}`);
  });
  console.log("\nUse: pnpm run image --id <id>\n");
}

interface GenerateParams {
  id: string;
  lang: string;
  size: string;
  quality: ImageQuality;
  n: number;
  out: string;
  format: ImageFormat;
  arg?: string;
}

async function runGenerate(params: GenerateParams): Promise<void> {
  requireEnv("OPENAI_API_KEY");
  requireEnv("CMS_HOST");
  requireEnv("CMS_API_KEY");

  console.log(`📥 Fetching prompt id=${params.id} from CMS...`);
  const prompt = await fetchPromptById(params.id, params.lang);
  if (!prompt) {
    console.error(`❌ prompt id=${params.id} not found`);
    process.exit(1);
  }

  if (prompt.needReferenceImages) {
    console.error(
      `⚠️  id=${params.id} ("${prompt.title}") requires an input image, which v1 does not support. Use --image once editing is added. Skipping.`
    );
    process.exit(1);
  }

  const rawText =
    params.lang !== "en" && prompt.translatedContent
      ? prompt.translatedContent
      : prompt.content;
  let promptText = cleanPromptContent(rawText);

  if (hasArguments(promptText)) {
    if (params.arg) {
      promptText = substituteArguments(promptText, params.arg);
      console.log(`🔤 Substituted {argument} placeholders with: "${params.arg}"`);
    } else {
      console.warn(
        `⚠️  Prompt contains unresolved {argument} placeholders. Pass --arg "<text>" to fill them. Continuing as-is.`
      );
    }
  }

  console.log(
    `🎨 Generating ${params.n} image(s) with gpt-image-2 (size=${params.size}, quality=${params.quality})...`
  );
  const buffers = await generateImages(promptText, {
    size: params.size,
    quality: params.quality,
    n: params.n,
    format: params.format,
  });

  fs.mkdirSync(params.out, { recursive: true });
  buffers.forEach((buf, i) => {
    const filename = buildImageFilename(prompt.id, prompt.title, i, params.format);
    const filepath = path.join(params.out, filename);
    fs.writeFileSync(filepath, buf);
    console.log(`✅ Saved ${filepath}`);
  });
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      id: { type: "string" },
      list: { type: "boolean", default: false },
      limit: { type: "string", default: "50" },
      lang: { type: "string", default: "en" },
      size: { type: "string", default: "1024x1024" },
      quality: { type: "string", default: "auto" },
      n: { type: "string", default: "1" },
      out: { type: "string", default: "output" },
      format: { type: "string", default: "png" },
      arg: { type: "string" },
    },
  });

  if (values.list) {
    await runList(values.lang as string, parseInt(values.limit as string, 10));
    return;
  }

  if (!values.id) {
    console.error(
      "Usage:\n" +
        "  pnpm run image --id <id> [--lang <locale>] [--size <s>] [--quality <q>] [--n <count>] [--out <dir>] [--format <fmt>] [--arg <text>]\n" +
        "  pnpm run image --list [--limit <n>]"
    );
    process.exit(1);
  }

  await runGenerate({
    id: values.id as string,
    lang: values.lang as string,
    size: values.size as string,
    quality: values.quality as ImageQuality,
    n: parseInt(values.n as string, 10),
    out: values.out as string,
    format: values.format as ImageFormat,
    arg: values.arg as string | undefined,
  });
}

main().catch((err) => {
  console.error("❌", err?.message ?? err);
  process.exit(1);
});
```

- [ ] **Step 4: Verify the usage/help path (no network)**

Run: `pnpm run image`
Expected: prints the `Usage:` block and exits non-zero (no `--id` / `--list`).

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-image.ts package.json .gitignore
git commit -m "feat: add catalog-linked image generation CLI"
```

---

### Task 5: End-to-end verification (manual, requires live credentials)

**Files:** none (verification only).

This task exercises the real CMS and OpenAI API using the keys in `.env`. It is the acceptance check for the feature.

- [ ] **Step 1: Install dependencies**

Run: `pnpm install`
Expected: completes without error; `openai` present in `node_modules`.

- [ ] **Step 2: Unit tests pass**

Run: `pnpm test`
Expected: all prompt-preparer tests PASS.

- [ ] **Step 3: List prompts from the CMS**

Run: `pnpm run image --list --limit 10`
Expected: a table of up to 10 prompts with numeric ids and titles. Note a text-to-image id (no `🖼️`) and a `🖼️` id for later.

- [ ] **Step 4: Generate from a text-to-image prompt**

Run: `pnpm run image --id <text-to-image-id>`
Expected: logs "Generating 1 image(s)...", then "✅ Saved output/<id>-<slug>-1.png". Open the PNG and confirm it is a valid image.

- [ ] **Step 5: Reference-image prompt is refused**

Run: `pnpm run image --id <needReferenceImages-id>`
Expected: prints the "requires an input image" warning and exits non-zero; no file written.

- [ ] **Step 6: Update LOCAL_DEVELOPMENT docs**

In `docs/LOCAL_DEVELOPMENT.md`, add `OPENAI_API_KEY` to the env section and add an "Image Generation" row to the scripts table documenting `pnpm run image --id <id>` and `pnpm run image --list`.

- [ ] **Step 7: Commit**

```bash
git add docs/LOCAL_DEVELOPMENT.md
git commit -m "docs: document image generation CLI in local development guide"
```

---

## Self-Review

**Spec coverage:**
- CLI `--id` generation → Task 4. ✅
- `--list` discovery → Task 4 (`runList`). ✅
- Text-to-image via `images.generate`, model `gpt-image-2` → Task 3. ✅
- Env from `.env` (`OPENAI_API_KEY`/`CMS_HOST`/`CMS_API_KEY`) → Task 4 (`requireEnv`), Task 3 (key check). ✅
- Save under `output/`, git-ignored → Task 4 (Steps 1, 3). ✅
- Live CMS fetch by id (`fetchPromptById`) → Task 2. ✅
- `needReferenceImages` warn + abort → Task 4 (`runGenerate`). ✅
- Prompt-text choice (content vs translatedContent), clean fences, `{argument}` handling → Task 4 + Task 1. ✅
- Error handling (missing env, CMS non-2xx / 404, OpenAI errors, unresolved args) → Tasks 2, 3, 4. ✅
- Tests via `node:test`/`tsx`, `test` script → Task 1. ✅
- Verification flow → Task 5. ✅

**Placeholder scan:** No TBD/TODO; every code step contains full code. ✅

**Type consistency:** `generateImages(prompt, opts)`, `GenerateOptions { size, quality, n, format }`, `ImageQuality`/`ImageFormat`, `fetchPromptById(id, locale)`, and the prompt-preparer signatures are used identically across tasks. ✅

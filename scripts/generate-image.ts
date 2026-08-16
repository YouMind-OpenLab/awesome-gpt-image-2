import "dotenv/config";
import fs from "fs";
import path from "path";
import { parseArgs } from "node:util";
import {
  fetchPromptById,
  fetchAllPrompts,
  fetchPromptCategories,
} from "./utils/cms-client.js";
import { SUPPORTED_LANGUAGES } from "./utils/markdown-generator.js";
import {
  generateImages,
  type ImageQuality,
  type ImageFormat,
} from "./utils/image-generator.js";
import {
  cleanPromptContent,
  hasArguments,
  substituteArguments,
  slugify,
  buildImageFilename,
} from "./utils/prompt-preparer.js";
import { getReadmePromptByNo, parseReadmePrompts } from "./utils/readme-parser.js";

interface OutputOptions {
  size: string;
  quality: ImageQuality;
  n: number;
  out: string;
  format: ImageFormat;
  arg?: string;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`❌ Environment variable ${name} is not set. Add it to .env`);
    process.exit(1);
  }
  return v;
}

/** Substitute or warn about {argument} placeholders. */
function applyArgs(promptText: string, arg?: string): string {
  if (!hasArguments(promptText)) return promptText;
  if (arg) {
    console.log(`🔤 Substituted {argument} placeholders with: "${arg}"`);
    return substituteArguments(promptText, arg);
  }
  console.warn(
    `⚠️  Prompt contains unresolved {argument} placeholders. Pass --arg "<text>" to fill them. Continuing as-is.`
  );
  return promptText;
}

/** Generate images for a prepared prompt and write them to disk. */
async function generateAndSave(
  promptText: string,
  makeName: (index: number) => string,
  opts: OutputOptions
): Promise<void> {
  console.log(
    `🎨 Generating ${opts.n} image(s) with gpt-image-2 (size=${opts.size}, quality=${opts.quality})...`
  );
  const buffers = await generateImages(promptText, {
    size: opts.size,
    quality: opts.quality,
    n: opts.n,
    format: opts.format,
  });

  fs.mkdirSync(opts.out, { recursive: true });
  buffers.forEach((buf, i) => {
    const filepath = path.join(opts.out, makeName(i));
    fs.writeFileSync(filepath, buf);
    console.log(`✅ Saved ${filepath}`);
  });
}

/** Map a locale to its README filename (defaults to README.md). */
function readmePathForLang(lang: string): string {
  return SUPPORTED_LANGUAGES.find((l) => l.code === lang)?.readmeFileName ?? "README.md";
}

// --- CMS-backed paths -------------------------------------------------------

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

async function runFromId(id: string, lang: string, opts: OutputOptions): Promise<void> {
  requireEnv("OPENAI_API_KEY");
  requireEnv("CMS_HOST");
  requireEnv("CMS_API_KEY");

  console.log(`📥 Fetching prompt id=${id} from CMS...`);
  const prompt = await fetchPromptById(id, lang);
  if (!prompt) {
    console.error(`❌ prompt id=${id} not found`);
    process.exit(1);
  }
  if (prompt.needReferenceImages) {
    console.error(
      `⚠️  id=${id} ("${prompt.title}") requires an input image, which v1 does not support. Skipping.`
    );
    process.exit(1);
  }

  const rawText =
    lang !== "en" && prompt.translatedContent ? prompt.translatedContent : prompt.content;
  const promptText = applyArgs(cleanPromptContent(rawText), opts.arg);
  await generateAndSave(
    promptText,
    (i) => buildImageFilename(prompt.id, prompt.title, i, opts.format),
    opts
  );
}

// --- README-backed paths (no CMS needed) ------------------------------------

function runReadmeList(lang: string, limit: number): void {
  const readmePath = readmePathForLang(lang);
  if (!fs.existsSync(readmePath)) {
    console.error(`❌ ${readmePath} not found`);
    process.exit(1);
  }
  const prompts = parseReadmePrompts(fs.readFileSync(readmePath, "utf-8"));
  console.log(`\nPrompts in ${readmePath} (${Math.min(limit, prompts.length)} of ${prompts.length}):\n`);
  prompts.slice(0, limit).forEach((p) => {
    console.log(`  No.${String(p.no).padStart(3)}  ${p.title}`);
  });
  console.log("\nUse: pnpm run image --no <number>\n");
}

async function runFromReadme(no: number, lang: string, opts: OutputOptions): Promise<void> {
  requireEnv("OPENAI_API_KEY");

  const readmePath = readmePathForLang(lang);
  if (!fs.existsSync(readmePath)) {
    console.error(`❌ ${readmePath} not found`);
    process.exit(1);
  }
  const prompt = getReadmePromptByNo(fs.readFileSync(readmePath, "utf-8"), no);
  if (!prompt) {
    console.error(`❌ No.${no} not found in ${readmePath}`);
    process.exit(1);
  }

  console.log(`📖 Using ${readmePath} No.${no}: ${prompt.title}`);
  const promptText = applyArgs(cleanPromptContent(prompt.content), opts.arg);
  await generateAndSave(
    promptText,
    (i) => buildImageFilename(prompt.no, prompt.title, i, opts.format),
    opts
  );
}

// --- Free-text path (no CMS, no README) -------------------------------------

async function runFromPrompt(text: string, opts: OutputOptions): Promise<void> {
  requireEnv("OPENAI_API_KEY");
  const promptText = applyArgs(text, opts.arg);
  await generateAndSave(
    promptText,
    (i) => `prompt-${slugify(text)}-${i + 1}.${opts.format}`,
    opts
  );
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      prompt: { type: "string" },
      id: { type: "string" },
      no: { type: "string" },
      list: { type: "boolean", default: false },
      "readme-list": { type: "boolean", default: false },
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

  const lang = values.lang as string;
  const limit = parseInt(values.limit as string, 10);
  const opts: OutputOptions = {
    size: values.size as string,
    quality: values.quality as ImageQuality,
    n: parseInt(values.n as string, 10),
    out: values.out as string,
    format: values.format as ImageFormat,
    arg: values.arg as string | undefined,
  };

  if (values.prompt) return runFromPrompt(values.prompt as string, opts);
  if (values.no) return runFromReadme(parseInt(values.no as string, 10), lang, opts);
  if (values["readme-list"]) return runReadmeList(lang, limit);
  if (values.list) return runList(lang, limit);
  if (values.id) return runFromId(values.id as string, lang, opts);

  console.error(
    "Usage:\n" +
      '  pnpm run image --prompt "<text>"          Generate from free text (no CMS)\n' +
      "  pnpm run image --no <number>              Generate from README No.<number> (no CMS)\n" +
      "  pnpm run image --id <id>                  Generate from a CMS prompt (needs CMS_HOST/CMS_API_KEY)\n" +
      "  pnpm run image --readme-list [--limit n]  List prompts parsed from the README\n" +
      "  pnpm run image --list [--limit n]         List prompts from the CMS\n" +
      "\n" +
      "Options: --lang <locale> --size <s> --quality <low|medium|high|auto> --n <count> --out <dir> --format <png|webp|jpeg> --arg <text>"
  );
  process.exit(1);
}

main().catch((err) => {
  console.error("❌", err?.message ?? err);
  process.exit(1);
});

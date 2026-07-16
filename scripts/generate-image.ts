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

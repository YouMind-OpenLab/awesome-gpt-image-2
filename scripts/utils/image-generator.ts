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

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

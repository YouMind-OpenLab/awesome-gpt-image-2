export interface ReadmePrompt {
  no: number;
  title: string;
  content: string;
}

// Matches the per-prompt heading emitted by markdown-generator: "### No. 5: Title".
const HEADING_RE = /^### No\. (\d+): (.+)$/gm;
// Matches the first fenced code block in a section (the prompt body).
const FENCE_RE = /```[\w-]*\n([\s\S]*?)\n```/;

/**
 * Parse all prompts out of a generated README. For each "### No. N: Title"
 * heading, the prompt body is the first fenced code block in that section.
 */
export function parseReadmePrompts(markdown: string): ReadmePrompt[] {
  const results: ReadmePrompt[] = [];
  const headings = [...markdown.matchAll(HEADING_RE)];

  for (let i = 0; i < headings.length; i++) {
    const m = headings[i];
    const no = parseInt(m[1], 10);
    const title = m[2].trim();
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < headings.length ? headings[i + 1].index ?? markdown.length : markdown.length;
    const section = markdown.slice(start, end);

    const fence = section.match(FENCE_RE);
    if (fence) {
      results.push({ no, title, content: fence[1] });
    }
  }

  return results;
}

/** Return the prompt whose "No." equals `no`, or null when absent. */
export function getReadmePromptByNo(markdown: string, no: number): ReadmePrompt | null {
  return parseReadmePrompts(markdown).find((p) => p.no === no) ?? null;
}

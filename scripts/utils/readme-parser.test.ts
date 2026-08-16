import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReadmePrompts, getReadmePromptByNo } from "./readme-parser.js";

const SAMPLE = [
  "## Featured",
  "",
  "### No. 1: First Prompt",
  "",
  "![Language-EN](x)",
  "",
  "#### 📖 Description",
  "",
  "Desc one.",
  "",
  "#### 📝 Prompt",
  "",
  "```",
  'A red cube {argument name="x"}',
  "```",
  "",
  "#### 📌 Details",
  "",
  "---",
  "",
  "### No. 2: Second Prompt",
  "",
  "#### 📝 Prompt",
  "",
  "```",
  "A blue sphere",
  "on white",
  "```",
  "",
  "---",
].join("\n");

test("parseReadmePrompts returns every No. section with title and fenced content", () => {
  const prompts = parseReadmePrompts(SAMPLE);
  assert.equal(prompts.length, 2);
  assert.deepEqual(prompts[0], {
    no: 1,
    title: "First Prompt",
    content: 'A red cube {argument name="x"}',
  });
  assert.equal(prompts[1].no, 2);
  assert.equal(prompts[1].title, "Second Prompt");
  assert.equal(prompts[1].content, "A blue sphere\non white");
});

test("getReadmePromptByNo returns the matching prompt", () => {
  const p = getReadmePromptByNo(SAMPLE, 2);
  assert.equal(p?.content, "A blue sphere\non white");
});

test("getReadmePromptByNo returns null for a missing number", () => {
  assert.equal(getReadmePromptByNo(SAMPLE, 99), null);
});

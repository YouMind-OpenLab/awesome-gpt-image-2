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

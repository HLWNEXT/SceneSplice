import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { describeButterfly, describeClimate, frameCaption, offsetAt, parseStory, storyFrame, storyPrompt } from "../lib/scenario.ts";
import { NODE_STORY, buildStoryWorkflow } from "../lib/story-workflow.ts";
import { buildGeminiPrompt } from "../lib/whatifstreet-workflow.ts";

const storyTemplate = JSON.parse(readFileSync(new URL("../workflows/storyline.text.api.json", import.meta.url), "utf8"));

test("a future pick starts today and runs to the chosen horizon", () => {
  assert.deepEqual(storyFrame(50), { origin: 0, horizon: 50 });
});

test("a past pick starts in the past and runs forward to today", () => {
  const f = storyFrame(-50);
  assert.deepEqual(f, { origin: -50, horizon: 50 });
  assert.equal(offsetAt(f, 0), -50);
  assert.equal(offsetAt(f, 50), 0, "the last year of a past story is today");
});

test("'today' has no span of its own, so the story looks 10 years ahead", () => {
  assert.deepEqual(storyFrame(0), { origin: 0, horizon: 10 });
});

test("the timeline caption says what Year 0 means", () => {
  assert.equal(frameCaption(storyFrame(50)), "Year 0 = today");
  assert.match(frameCaption(storyFrame(-50)), /Year 0 = 50 yr ago/);
});

test("storyPrompt carries the street, horizon, event and weather, and omits absent weather", () => {
  const p = storyPrompt({ locationLabel: "350 5th Ave, New York", years: -50, butterflyPrompt: "solar won", climatePrompt: "rain" });
  assert.match(p, /350 5th Ave/);
  assert.match(p, /50 years ago/);
  assert.match(p, /greater than 50/);
  assert.match(p, /solar won/);
  assert.match(p, /rain/);
  assert.doesNotMatch(storyPrompt({ locationLabel: "x", years: 10, butterflyPrompt: "e", climatePrompt: null }), /weather/);
});

test("parseStory reads clean JSON and forces the root to year 0", () => {
  const s = parseStory(JSON.stringify({ text: "Start", year: 3, children: [{ text: "Later", year: 20 }] }), 50);
  assert.equal(s.year, 0);
  assert.equal(s.children![0].year, 20);
});

test("parseStory tolerates code fences and chatter around the JSON", () => {
  const s = parseStory('Here you go:\n```json\n{"text":"A","year":0,"children":[{"text":"B","year":5}]}\n```', 50);
  assert.equal(s.children![0].text, "B");
});

test("parseStory repairs years that run backwards or past the horizon", () => {
  const s = parseStory(JSON.stringify({ text: "A", year: 0, children: [{ text: "B", year: 30, children: [{ text: "C", year: 10 }, { text: "D", year: 900 }] }] }), 50);
  const b = s.children![0];
  assert.equal(b.children![0].year, 30, "a child never precedes its parent");
  assert.equal(b.children![1].year, 50, "nothing runs past the horizon");
});

test("parseStory rejects replies that are not a usable storyline", () => {
  assert.throws(() => parseStory("I cannot do that.", 50), /didn't return/);
  assert.throws(() => parseStory("{not json}", 50), /valid JSON/);
  assert.throws(() => parseStory('{"year":0}', 50), /no text/);
  const wide = { text: "r", year: 0, children: Array.from({ length: 20 }, (_, i) => ({ text: `c${i}`, year: i })) };
  assert.throws(() => parseStory(JSON.stringify(wide), 50), /more than/);
});

test("describe helpers give short human labels", () => {
  assert.equal(describeButterfly({ id: "solar" }), "Solar goes global");
  assert.equal(describeButterfly({ custom: "  free text " }), "free text");
  assert.equal(describeButterfly(null), null);
  assert.equal(describeClimate(null), "No special weather");
  assert.equal(describeClimate({ id: "rain" }), "Rain");
});

test("the story template feeds the PreviewAny output from the Gemini node and injects without mutating it", () => {
  assert.deepEqual(storyTemplate[NODE_STORY.output].inputs.source, [NODE_STORY.gemini, 0]);
  assert.equal(storyTemplate[NODE_STORY.gemini].inputs.images, undefined, "story writing is text-only");
  const wf = buildStoryWorkflow(storyTemplate, { prompt: "p", seed: 9 });
  assert.equal(wf[NODE_STORY.gemini].inputs.prompt, "p");
  assert.equal(wf[NODE_STORY.gemini].inputs.seed, 9);
  assert.notEqual(storyTemplate[NODE_STORY.gemini].inputs.prompt, "p");
});

test("a beat's event is added to the image prompt only when given", () => {
  const base = { timeHint: "10 years in the future", butterflyPrompt: null, climatePrompt: null };
  assert.match(buildGeminiPrompt({ ...base, eventHint: "Rooftop gardens spread." }), /Rooftop gardens spread\./);
  assert.doesNotMatch(buildGeminiPrompt(base), /specific moment/);
});

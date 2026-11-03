// Scenario model for the merged WhatIfStreet app: four starting inputs (location, time, butterfly
// event, environment) are turned into a branching storyline whose beats become keyframes.
// Pure logic only, so it runs under node --test.

import { BUTTERFLY_ACTIONS, type ButterflySelection } from "./butterfly.ts";
import { CLIMATE_CONDITIONS, type ClimateSelection } from "./climate.ts";
import type { StoryJson } from "./storyline.ts";
import { formatOffset } from "./timetravel.ts";

export type InputKind = "location" | "time" | "butterfly" | "environment";
export const INPUT_KINDS: readonly InputKind[] = ["location", "time", "butterfly", "environment"];
export const INPUT_LABELS: Record<InputKind, string> = {
  location: "Location",
  time: "Time",
  butterfly: "Butterfly event",
  environment: "Environment",
};

/**
 * The canvas timeline only runs forward from Year 0, so the story is framed as years since its start:
 * a future pick starts today and runs to the chosen horizon; a past pick starts at that past moment
 * and runs forward to today (an alternate history). "Today" has no span of its own, so it looks 10
 * years ahead. `origin` is where Year 0 sits relative to today (negative = past).
 */
export type StoryFrame = { origin: number; horizon: number };

export function storyFrame(years: number): StoryFrame {
  if (years < 0) return { origin: years, horizon: -years };
  return { origin: 0, horizon: Math.max(years, 10) };
}

/** Years from today for a beat that sits `year` years into the story. */
export const offsetAt = (frame: StoryFrame, year: number) => frame.origin + year;

/** "Year 0 = 50 YR AGO" style caption for the timeline. */
export function frameCaption(frame: StoryFrame): string {
  return frame.origin === 0
    ? "Year 0 = today"
    : `Year 0 = ${formatOffset(frame.origin).toLowerCase()} · the timeline runs forward to today`;
}

export function describeButterfly(sel: ButterflySelection | null): string | null {
  if (!sel) return null;
  if ("custom" in sel) return sel.custom.trim() || null;
  return BUTTERFLY_ACTIONS.find((a) => a.id === sel.id)?.label ?? null;
}

export function describeClimate(sel: ClimateSelection): string {
  if (!sel) return "No special weather";
  if ("custom" in sel) return sel.custom.trim() || "No special weather";
  return CLIMATE_CONDITIONS.find((c) => c.id === sel.id)?.label ?? "No special weather";
}

export type StoryRequest = {
  locationLabel: string;
  years: number;
  butterflyPrompt: string;
  climatePrompt: string | null;
};

/** The per-run user message for the story-writing Gemini node. */
export function storyPrompt(r: StoryRequest): string {
  const { origin, horizon } = storyFrame(r.years);
  const span =
    r.years < 0
      ? `The story starts ${horizon} years ago, when the event takes hold, and runs forward to the present day. Year 0 = ${horizon} years ago.`
      : r.years === 0
        ? `The story starts today, as the event begins, and covers the next ${horizon} years. Year 0 = today.`
        : `The story starts today, as the event begins, and runs ${horizon} years into the future. Year 0 = today.`;
  void origin;
  return [
    `Street: ${r.locationLabel}.`,
    span,
    `Horizon: no beat may have a year greater than ${horizon}; the last beats should land at or near it.`,
    `World event (the butterfly event): ${r.butterflyPrompt}.`,
    r.climatePrompt ? `Prevailing weather and light: ${r.climatePrompt}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

const MAX_BEATS = 16;

/**
 * Reads the model's reply into a StoryJson. Tolerates code fences and chatter around the JSON, and
 * repairs what is safe to repair (years out of order or past the horizon) instead of rejecting it.
 */
export function parseStory(raw: string, horizon: number): StoryJson {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("The model didn't return a storyline.");
  let data: unknown;
  try {
    data = JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new Error("The model's storyline wasn't valid JSON.");
  }
  let count = 0;
  const clean = (n: any, minYear: number): StoryJson => {
    if (!n || typeof n.text !== "string" || !n.text.trim()) throw new Error("A story beat had no text.");
    if (++count > MAX_BEATS) throw new Error(`The storyline has more than ${MAX_BEATS} beats.`);
    const asked = Number(n.year);
    const year = Math.min(horizon, Math.max(minYear, Number.isFinite(asked) ? asked : minYear));
    const kids = Array.isArray(n.children) ? n.children.map((c: unknown) => clean(c, year)) : [];
    return { text: n.text.trim().slice(0, 400), year, ...(kids.length ? { children: kids } : {}) };
  };
  const root = clean(data, 0);
  root.year = 0;
  return root;
}

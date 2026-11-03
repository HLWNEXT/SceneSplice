// Node IDs in workflows/storyline.text.api.json (text-only Gemini -> PreviewAny) that the UI touches.
// Same pattern as lib/whatifstreet-workflow.ts.

export const NODE_STORY = {
  gemini: "1",
  output: "2",
} as const;

export const STORY_NODE_PROGRESS: Record<string, { label: string; from: number; to: number }> = {
  "1": { label: "Writing the storyline...", from: 0, to: 95 },
  "2": { label: "Reading the storyline...", from: 95, to: 100 },
};

type Workflow = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

export type StoryWorkflowParams = { prompt: string; seed: number };

export function buildStoryWorkflow(template: Workflow, p: StoryWorkflowParams): Workflow {
  const wf = structuredClone(template);
  wf[NODE_STORY.gemini].inputs.prompt = p.prompt;
  wf[NODE_STORY.gemini].inputs.seed = p.seed;
  return wf;
}

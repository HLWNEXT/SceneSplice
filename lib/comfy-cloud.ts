// Differences between Comfy Cloud and a self-hosted ComfyUI server, translated so the browser-side
// client in lib/comfy.ts can stay unaware of which one it is talking to.

type Workflow = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

/**
 * Comfy Cloud has no GET /history/{id}; the equivalent is GET /api/jobs/{id}. Reshape its response into
 * the local /history form that trackGraph() already understands. Unfinished jobs map to `{}`, which the
 * poller reads as "still running".
 */
export function jobToHistory(promptId: string, job: any): Record<string, unknown> {
  const status = job?.status;
  if (status === "completed") {
    return { [promptId]: { status: { status_str: "success", completed: true, messages: [] }, outputs: job.outputs ?? {} } };
  }
  if (status === "failed" || status === "cancelled") {
    const e = job.execution_error;
    const detail = {
      node_type: e?.node_type ?? "Comfy Cloud",
      exception_message: e?.exception_message ?? (status === "cancelled" ? "The job was cancelled." : "The job failed."),
    };
    return { [promptId]: { status: { status_str: "error", completed: false, messages: [["execution_error", detail]] }, outputs: {} } };
  }
  return {};
}

/**
 * Swap nodes that come from custom-node packs Comfy Cloud doesn't ship for core equivalents.
 * Currently one: `easy imageScaleDownToSize` (comfyui-easy-use), which only feeds GetImageSize in the
 * LTX video graphs. ImageScaleToMaxDimension also upscales small inputs, but video keyframes here are
 * Flux Kontext outputs of about a megapixel, so the resulting dimensions are the same in practice.
 */
export function adaptWorkflowForCloud<T extends Workflow>(workflow: T): T {
  const out = structuredClone(workflow);
  for (const node of Object.values(out)) {
    if (node.class_type !== "easy imageScaleDownToSize") continue;
    node.class_type = "ImageScaleToMaxDimension";
    node.inputs = { image: node.inputs.images, upscale_method: "lanczos", largest_size: node.inputs.size };
  }
  return out;
}

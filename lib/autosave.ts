// Browser-local autosave for the work in progress. Stored per browser and per site address, so someone who
// opens the public tunnel URL gets back what they last had open there. Every call is safe when storage is
// blocked or full (private windows, quota): it just does nothing.

export const WALKTHROUGH_AUTOSAVE_KEY = "scenesplice:walkthrough:v1";
export const STORYLINE_AUTOSAVE_KEY = "scenesplice:storyline:v1";

export function loadAutosave(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function saveAutosave(key: string, text: string): void {
  try {
    window.localStorage.setItem(key, text);
  } catch {
    /* storage unavailable or full */
  }
}

export function clearAutosave(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

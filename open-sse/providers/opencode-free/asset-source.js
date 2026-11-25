/** Read the inlined official assets once; bundler-safe, no filesystem lookup. */
import { OFFICIAL_PROMPT_V2, OFFICIAL_TOOLS_V2 } from "./assets.js";

let toolsJson;

export function officialPromptText() {
  return OFFICIAL_PROMPT_V2;
}

export function officialToolsText() {
  return toolsJson ??= JSON.stringify(OFFICIAL_TOOLS_V2);
}

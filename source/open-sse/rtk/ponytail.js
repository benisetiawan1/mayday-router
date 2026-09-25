// Ponytail injector: appends the "lazy senior dev" instruction into the system
// message of the final request body, just before dispatch to the provider executor.

import { injectSystemPrompt } from "./systemInject.js";
import { PONYTAIL_PROMPTS } from "./ponytailPrompts.js";

export function injectPonytail(body, format, level) {
  injectSystemPrompt(body, format, PONYTAIL_PROMPTS[level]);
}

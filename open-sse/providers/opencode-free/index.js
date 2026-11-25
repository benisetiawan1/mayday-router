/**
 * OpenCode free-tier wire contract (v2.2.3 client).
 *
 * Vendored from Ebony-Vinyl/dsh-our-free-model (MIT), src/o2a/ — the parts that
 * are measured wire behaviour rather than plugin plumbing. Upstream compares the
 * request byte-for-byte against the official client: system prompt, the 13 tool
 * definitions, session shape, project id and headers. See docs/free-lane-wire.md
 * in that repository for the A/B evidence behind each rule.
 *
 * This module is the only place that knows those rules; the executor and the
 * response path only call into it.
 */
import { mintSessionIdentifier, isOfficialSessionID, sessionPhaseMs, phaseAgeMs, randomProjectID } from "./identity.js";
import { gatewayHeaders } from "./headers.js";
import { injectOfficialPrompt } from "./official-prompt.js";
import { officialTool, renamableToolName } from "./official-tools.js";
import { ToolRenameMap, officialForClientName } from "./tool-renames.js";
import { shapeToolSurface } from "./toolshape.js";
import { ensureChatUsage, ensureV2CompletionLimit } from "./gateway-body.js";

export { CLIENT_UA } from "./version.js";
export { gatewayHeaders, randomProjectID, mintSessionIdentifier, isOfficialSessionID };

/** Sessions older than this are re-minted; the upstream's slow clock is 36-bit ms. */
const SESSION_PLAUSIBILITY_MS = 60 * 24 * 60 * 60 * 1000;

/**
 * Map a conversation signal onto a session id the gate accepts. A canonical,
 * recent id is kept as-is (rewriting a valid id would rotate the quota bucket);
 * anything else is re-minted through the slow clock.
 */
export function canonicalSession(signal) {
  const value = typeof signal === "string" ? signal.trim() : "";
  if (isOfficialSessionID(value)) {
    const phase = sessionPhaseMs(value);
    if (phase !== null && phaseAgeMs(phase) < SESSION_PLAUSIBILITY_MS) return value;
  }
  return mintSessionIdentifier(value || "global");
}

/** The upstream path for the chat line. */
export function endpointFor() {
  return "/inference/openai/v1/chat/completions";
}

/**
 * Bodies the harness sends purely to generate a conversation title. Shaping them
 * as an agent session (13 tools, prompt) is answered with 403/429, so they ship
 * as written.
 */
const TITLE_MARKERS = /generate a title|write a title|create a title|come up with a title|title (?:for|of) (?:this|the) (?:conversation|chat|session|exchange|request)|conversation title|summarize (?:this|the) conversation/i;

export function isTitleRequest(body, shape = "chat") {
  if (!body || typeof body !== "object") return false;
  if (body.tool_choice !== undefined || (Array.isArray(body.tools) && body.tools.length)
    || (Array.isArray(body.functions) && body.functions.length)) return false;
  const rows = shape === "flat" ? body.input : body.messages;
  if (!Array.isArray(rows)) return false;
  const containsTitle = (value) => {
    if (typeof value === "string") return TITLE_MARKERS.test(value);
    if (!Array.isArray(value)) return false;
    return TITLE_MARKERS.test(value.map((block) => block?.text ?? "").join("\n"));
  };
  let matches = containsTitle(shape === "flat" ? body.instructions : shape === "claude" ? body.system : "");
  let count = 0;
  for (const row of rows) {
    if (!row || typeof row !== "object" || (shape === "flat" && typeof row.role !== "string")) continue;
    if (++count > 3 || !["user", "system", "developer"].includes(row.role)) return false;
    matches = containsTitle(row.content) || matches;
  }
  return count > 0 && matches;
}

function definitionOf(entry, shape) {
  if (!entry || typeof entry !== "object") return null;
  const wrapper = shape === "chat" ? entry.function : entry;
  if (wrapper === null || wrapper === undefined || typeof wrapper !== "object") return null;
  const schema = shape === "claude" ? wrapper.input_schema : wrapper.parameters;
  return { description: wrapper.description, schema };
}

/** Does this declaration already carry the verbatim (rendered) official definition? */
function carriesOfficialDefinition(entry, name, shape) {
  const own = definitionOf(entry, shape);
  if (own === null) return false;
  const rendered = officialTool(shape, name);
  const wrapper = shape === "chat" ? rendered.function : rendered;
  if (!wrapper) return false;
  const targetSchema = shape === "claude" ? wrapper.input_schema : wrapper.parameters;
  return own.description === wrapper.description
    && JSON.stringify(own.schema) === JSON.stringify(targetSchema);
}

function placeholderNote(names) {
  const list = names.map((name) => `\`${name}\``).join(", ");
  return `The tools ${list} are part of the host CLI's own toolset and are placeholders in this session; they do nothing here. Use the other tools you have been given instead.`;
}

function appendSystemContext(body, shape, note) {
  if (shape === "flat") {
    body.instructions = typeof body.instructions === "string" && body.instructions.trim() !== ""
      ? `${body.instructions}\n\n${note}`
      : note;
    return;
  }
  if (shape === "claude") {
    body.system = Array.isArray(body.system)
      ? [...body.system, { type: "text", text: note }]
      : typeof body.system === "string" && body.system !== "" ? `${body.system}\n\n${note}` : note;
    return;
  }
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const first = messages[0];
  if (first?.role === "system" && typeof first.content === "string") {
    body.messages = [{ ...first, content: `${first.content}\n\n${note}` }, ...messages.slice(1)];
    return;
  }
  if (first?.role === "system" && Array.isArray(first.content)) {
    body.messages = [{ ...first, content: [...first.content, { type: "text", text: note }] }, ...messages.slice(1)];
    return;
  }
  body.messages = [{ role: "system", content: note }, ...messages];
}

const toolNameMaps = new WeakMap();

/**
 * Adapt a request to the free-lane wire contract in place.
 *
 * Returns the wire→caller rename map so the response path can restore names;
 * the same map is also retrievable through {@link takeToolNameMap} for callers
 * that only hold the body.
 */
export function shapeFreeLaneBody(body, shape = "chat") {
  if (!body || typeof body !== "object") return new ToolRenameMap();
  if (isTitleRequest(body, shape)) return new ToolRenameMap();

  // A retried turn runs this pass again over the already-shaped body. The second
  // pass finds wire handles and mints nothing, so keep the first pass's map:
  // it is what the response path needs to restore caller names.
  const previous = toolNameMaps.get(body) || null;

  injectOfficialPrompt(body, shape);

  const keep = new Set();
  for (const tool of Array.isArray(body.tools) ? body.tools : []) {
    const name = renamableToolName(shape, tool);
    if (name !== null && carriesOfficialDefinition(tool, name, shape)) keep.add(name);
  }
  const { renames, injected } = shapeToolSurface(body, shape, { keep });
  if (injected.length > 0) appendSystemContext(body, shape, placeholderNote(injected));

  if (body.tool_choice === "none"
    || (body.tool_choice !== null && typeof body.tool_choice === "object" && body.tool_choice.type === "none")) {
    delete body.tool_choice;
  }
  if (shape === "flat" && !body.tool_choice) body.tool_choice = "auto";

  ensureChatUsage(body, shape);
  ensureV2CompletionLimit(body, shape);

  if (renames.size > 0) toolNameMaps.set(body, renames);
  else if (!previous) toolNameMaps.delete(body);
  return renames.size > 0 ? renames : (previous || renames);
}

export function takeToolNameMap(body) {
  return toolNameMaps.get(body) || null;
}

/**
 * Compose the fingerprint rename map (wire→caller) with any map a request
 * translator already produced (translated→source).
 */
export function mergeToolNameMaps(base, extra) {
  if (!extra?.size) return base;
  if (!base?.size) return extra;
  const merged = new Map(base);
  for (const [wire, caller] of extra) merged.set(wire, base.get(caller) ?? caller);
  return merged;
}

function resolveName(map, name) {
  if (!map || typeof name !== "string") return name;
  if (typeof map.resolve === "function") return map.resolve(name);
  return map.get(name) ?? name;
}

/** Restore the caller's tool spelling in a streaming delta or a final payload. */
export function restoreToolNames(payload, map) {
  if (!map?.size || !payload) return payload;
  if (Array.isArray(payload)) return payload.map((item) => restoreToolNames(item, map));
  if (typeof payload !== "object") return payload;

  let out = payload;
  const put = (key, value) => {
    if (out === payload) out = { ...payload };
    out[key] = value;
  };

  if (payload.type === "content_block_start") {
    const block = payload.content_block;
    if (block?.type === "tool_use" && typeof block.name === "string") {
      const name = resolveName(map, block.name);
      if (name !== block.name) put("content_block", { ...block, name });
    }
  }

  if (Array.isArray(payload.content)) {
    const content = payload.content.map((block) => {
      if (block?.type !== "tool_use" || typeof block.name !== "string") return block;
      const name = resolveName(map, block.name);
      return name === block.name ? block : { ...block, name };
    });
    put("content", content);
  }

  if (Array.isArray(payload.choices)) {
    const choices = payload.choices.map((choice) => {
      let changed = false;
      const next = { ...choice };
      for (const holder of ["delta", "message"]) {
        const value = choice?.[holder];
        if (!value || !Array.isArray(value.tool_calls) || value.tool_calls.length === 0) continue;
        const calls = value.tool_calls.map((call) => {
          const name = call?.function?.name;
          if (typeof name !== "string") return call;
          const resolved = resolveName(map, name);
          if (resolved === name) return call;
          changed = true;
          return { ...call, function: { ...call.function, name: resolved } };
        });
        next[holder] = { ...value, tool_calls: calls };
      }
      return changed ? next : choice;
    });
    put("choices", choices);
  }

  if (Array.isArray(payload.output)) {
    const output = payload.output.map((item) => {
      if (item?.type !== "function_call" || typeof item.name !== "string") return item;
      const name = resolveName(map, item.name);
      return name === item.name ? item : { ...item, name };
    });
    put("output", output);
  }

  const item = payload.item;
  if (item?.type === "function_call" && typeof item.name === "string") {
    const name = resolveName(map, item.name);
    if (name !== item.name) put("item", { ...item, name });
  }

  return out;
}

export { officialForClientName };

// Thinking parameters: pure passthrough. See DECISIONS.md D10 (至高原则).
//
//   "以客户端为准：网关必须原样透传客户端的思考参数，不允许做任何翻译/转换/
//    改写——包括跨 wire 格式的形状转换、单位换算、档位量化、默认值注入、
//    能力表门控。客户端没说的，网关不说；客户端说了的，网关原样说。"
//
// The translation layer that used to live here (resolveFormat / applyFormat and
// its ~15 vendor shape cases, level↔budget quantization, capability gates,
// gemini clamps, default injection) has been deleted: it rewrote client values
// based on hardcoded model-name knowledge. What remains:
//   · parseSuffix/extractThinking   — read-only helpers (kiroConstants uses them)
//   · applyThinking                  — expresses an explicit `model(level)`
//                                      suffix (I5) in the CLIENT's own field
//                                      shape. The value is written verbatim;
//                                      no vendor shape, no unit conversion.

import { LEVEL_TO_BUDGET } from "./thinking.js";
import { FORMATS } from "../formats.js";

// Strip a trailing thinking suffix "model(value)" → "model" (no-op when absent).
export function stripThinkingSuffix(model) {
  if (typeof model !== "string") return model;
  const m = model.match(/^(.*)\([^()]+\)\s*$/);
  return m ? m[1].trim() : model;
}

// Parse model-name suffix "model(value)" → { cleanModel, override }.
// value: level name (high) | number (8192) | auto | none. null override when absent.
export function parseSuffix(model) {
  if (typeof model !== "string") return { cleanModel: model, override: null };
  const m = model.match(/^(.*)\(([^()]+)\)\s*$/);
  if (!m) return { cleanModel: model, override: null };
  const cleanModel = m[1].trim();
  const raw = m[2].trim().toLowerCase();
  if (raw === "none" || raw === "off") return { cleanModel, override: { mode: "none" } };
  if (raw === "auto") return { cleanModel, override: { mode: "auto" } };
  if (raw === "ultra") return { cleanModel, override: { mode: "level", level: raw } };
  if (/^\d+$/.test(raw)) return { cleanModel, override: { mode: "budget", budget: Number(raw) } };
  if (LEVEL_TO_BUDGET[raw] !== undefined) return { cleanModel, override: { mode: "level", level: raw } };
  return { cleanModel, override: null };
}

// Extract unified thinking intent from a request body (read-only).
// Returns { mode, budget?, level? } or null when no thinking intent present.
export function extractThinking(body) {
  if (!body || typeof body !== "object") return null;

  // Claude output_config.effort (explicit) — priority over adaptive thinking
  const oc = body.output_config?.effort;
  if (typeof oc === "string" && oc) {
    const e = oc.toLowerCase();
    if (e === "none" || e === "off") return { mode: "none" };
    if (e === "auto") return { mode: "auto" };
    return { mode: "level", level: e };
  }

  // OpenAI chat / Responses shape — check effort first (zai sends both thinking object and reasoning.effort)
  const effort = body.reasoning_effort ?? (typeof body.reasoning === "object" ? body.reasoning?.effort : null);
  if (typeof effort === "string" && effort) {
    const e = effort.toLowerCase();
    if (e === "none" || e === "off") return { mode: "none" };
    if (e === "auto") return { mode: "auto" };
    return { mode: "level", level: e };
  }

  // Claude shape
  const t = body.thinking;
  if (t && typeof t === "object") {
    if (t.type === "disabled") return { mode: "none" };
    if (t.type === "adaptive" || t.type === "enabled") {
      const budget = Number(t.budget_tokens);
      if (Number.isFinite(budget) && budget > 0) return { mode: "budget", budget };
      return { mode: "auto" };
    }
  }

  // Gemini shape (top-level, generationConfig, or request envelope)
  const tc = body.thinkingConfig || body.generationConfig?.thinkingConfig || body.request?.generationConfig?.thinkingConfig;
  if (tc && typeof tc === "object") {
    if (typeof tc.thinkingLevel === "string") return { mode: "level", level: tc.thinkingLevel.toLowerCase() };
    const tb = Number(tc.thinkingBudget);
    if (Number.isFinite(tb)) {
      if (tb === 0) return { mode: "none" };
      if (tb < 0) return { mode: "auto" };
      return { mode: "budget", budget: tb };
    }
  }

  // Qwen shape
  if (body.enable_thinking === false) return { mode: "none" };
  if (body.enable_thinking === true) {
    const tb = Number(body.thinking_budget);
    if (Number.isFinite(tb) && tb > 0) return { mode: "budget", budget: tb };
    return { mode: "auto" };
  }

  return null;
}

// Value carried by an explicit model(level) suffix, verbatim —
// number stays number, level string stays string. null when no suffix.
// The caller writes it into the field its OWN client shape uses.
export function suffixThinkingValue(model) {
  const { override } = parseSuffix(model);
  if (!override) return null;
  if (override.mode === "budget") return override.budget;
  if (override.mode === "level") return override.level;
  if (override.mode === "none") return "none";
  return "auto";
}

// Write a value into a client-shaped body, in that client's own field. Never
// converts: a number stays a number, a level stays a level string. A wire that
// has no field for a number (OpenAI `reasoning_effort`) still receives the
// number verbatim — the upstream decides (I4).
function writeClientShaped(sourceFormat, body, value) {
  switch (sourceFormat) {
    case FORMATS.CLAUDE:
      if (value === "none") { body.thinking = { type: "disabled" }; break; }
      if (typeof value === "number") { body.thinking = { type: "enabled", budget_tokens: value }; break; }
      body.thinking = { type: value === "auto" ? "adaptive" : "enabled" };
      if (typeof value === "string" && value !== "auto") body.output_config = { effort: value };
      break;
    case FORMATS.OPENAI_RESPONSES:
      body.reasoning = {
        ...(body.reasoning && typeof body.reasoning === "object" && !Array.isArray(body.reasoning) ? body.reasoning : {}),
        effort: value,
      };
      delete body.reasoning_effort;
      break;
    case FORMATS.GEMINI:
    case FORMATS.GEMINI_CLI:
      body.generationConfig = {
        ...(body.generationConfig || {}),
        thinkingConfig: typeof value === "number"
          ? { thinkingBudget: value }
          : value === "none"
            ? { thinkingBudget: 0 }
            : { thinkingLevel: value },
      };
      break;
    default:
      body.reasoning_effort = value;
      break;
  }
  return body;
}

// Apply thinking config to a request body. Passthrough (D10): the only thing
// written is an explicit `model(level)` suffix (I5), expressed in the CLIENT's
// own shape. No capability table, no level set, no default, no vendor shape.
export function applyThinking(sourceFormat, model, body) {
  if (!body || typeof body !== "object") return body;
  const value = suffixThinkingValue(model);
  if (value === null) return body;
  return writeClientShaped(sourceFormat, body, value);
}

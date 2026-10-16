// Format identifiers
export const FORMATS = {
  OPENAI: "openai",
  OPENAI_RESPONSES: "openai-responses",
  OPENAI_RESPONSE: "openai-response",
  CLAUDE: "claude",
  GEMINI: "gemini",
  GEMINI_CLI: "gemini-cli",
  VERTEX: "vertex",
  CODEX: "codex",
  ANTIGRAVITY: "antigravity",
  KIRO: "kiro",
  CURSOR: "cursor",
  OLLAMA: "ollama",
  COMMANDCODE: "commandcode"
};

// Map a target wire-format to its native thinking format. Used when a provider
// declares no thinking shape of its own: the wire format then decides, and the
// client's parameters are translated into that shape with their values intact
// (design: docs/tasks/thinking-param-respect). Lives here (a leaf module) so
// both the translator and the UI level picker can share it without a cycle.
export const FORMAT_TO_NATIVE = {
  openai: "openai",
  "openai-responses": "openai",
  "openai-response": "openai",
  codex: "openai",
  claude: "claude-budget",
  gemini: "gemini-budget",
  "gemini-cli": "gemini-budget",
  vertex: "gemini-budget",
  antigravity: "gemini-budget",
  kiro: "kiro",
  commandcode: "commandcode",
};

/**
 * Detect source format from request URL pathname + body.
 * Returns null to fall back to body-based detection.
 */
export function detectFormatByEndpoint(pathname, body) {
  // /v1/responses is always openai-responses
  if (pathname.includes("/v1/responses")) return FORMATS.OPENAI_RESPONSES;

  // /v1/messages is always Claude
  if (pathname.includes("/v1/messages")) return FORMATS.CLAUDE;

  // /v1/chat/completions + input[] → treat as openai (Cursor CLI sends Responses body via chat endpoint)
  if (pathname.includes("/v1/chat/completions") && Array.isArray(body?.input)) {
    return FORMATS.OPENAI;
  }

  return null;
}


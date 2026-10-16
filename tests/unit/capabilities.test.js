import { describe, expect, it } from "vitest";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";

describe("getCapabilitiesForModel", () => {

  it("reports DeepSeek V4.1-Flash ids as vision-capable without dropping their context", () => {
    const v41 = { vision: true, reasoning: true, contextWindow: 1000000, maxOutput: 384000 };
    expect(getCapabilitiesForModel(undefined, "deepseek-v4.1-flash")).toMatchObject(v41);
    expect(getCapabilitiesForModel("opencode-go", "deepseek-v4.1-flash")).toMatchObject(v41);
    expect(getCapabilitiesForModel("openrouter", "deepseek/deepseek-v4.1-flash")).toMatchObject(v41);
    // Thinking wire shape is provider-scoped (I2): the deepseek vendor declares
    // it; a model-name-only lookup resolves none.
    expect(getCapabilitiesForModel("deepseek", "deepseek-v4.1-flash").thinkingFormat).toBe("deepseek");
    expect(getCapabilitiesForModel(undefined, "deepseek-v4.1-flash").thinkingFormat).toBeNull();
    // "deepseek-flash" is the GA id for V4.1-Flash on the DeepSeek API; the pattern it
    // used to fall through to gives it 128K, which the exact entry keeps.
    expect(getCapabilitiesForModel("opencode-go", "deepseek-flash")).toMatchObject({
      vision: true,
      reasoning: true,
      contextWindow: 128000,
      maxOutput: 120000,
    });
    // the superseded text-only Flash id stays text-only
    expect(getCapabilitiesForModel("opencode-go", "deepseek-v4-flash").vision).toBe(false);
  });
  const claudeSonnet5Expected = {
    contextWindow: 1000000,
    maxOutput: 128000,
    thinkingFormat: "claude-adaptive",
    reasoning: true,
    vision: true,
    search: true,
  };

  const kiroGpt56Expected = {
    contextWindow: 272000,
    maxOutput: 128000,
    thinkingFormat: "openai",
    reasoning: true,
    vision: true,
    search: true,
  };

  it("reports Kiro Claude Opus 5 variants as 1M adaptive-thinking models", () => {
    for (const model of [
      "claude-opus-5",
      "anthropic/claude-opus-5",
      "claude-opus-5-thinking",
      "claude-opus-5-agentic",
      "claude-opus-5-thinking-agentic",
    ]) {
      expect(getCapabilitiesForModel("kiro", model)).toMatchObject(claudeSonnet5Expected);
    }
  });

  it("reports Claude Fable 5.1 as a permanent adaptive-thinking model", () => {
    expect(getCapabilitiesForModel("claude", "claude-fable-5-1")).toMatchObject({
      ...claudeSonnet5Expected,
      thinkingCanDisable: false,
    });
  });

  it("reports Kiro Claude Opus 4.8 as a 1M context model", () => {
    expect(getCapabilitiesForModel("kiro", "claude-opus-4.8").contextWindow).toBe(1000000);
    expect(getCapabilitiesForModel("kiro", "anthropic/claude-opus-4.8").contextWindow).toBe(1000000);
    expect(getCapabilitiesForModel("kiro", "claude-opus-4-8").contextWindow).toBe(1000000);
    expect(getCapabilitiesForModel("kiro", "claude-opus-4.8-thinking").contextWindow).toBe(1000000);
    expect(getCapabilitiesForModel("kiro", "claude-opus-4-8-thinking").contextWindow).toBe(1000000);
  });

  it("reports Kiro Claude Sonnet 5 as a 1M adaptive-thinking model", () => {
    expect(getCapabilitiesForModel("kiro", "claude-sonnet-5")).toMatchObject(claudeSonnet5Expected);
    expect(getCapabilitiesForModel("kiro", "anthropic/claude-sonnet-5")).toMatchObject(claudeSonnet5Expected);
    expect(getCapabilitiesForModel("kiro", "claude-sonnet-5-thinking")).toMatchObject(claudeSonnet5Expected);
    expect(getCapabilitiesForModel("kiro", "claude-sonnet-5-agentic")).toMatchObject(claudeSonnet5Expected);
    expect(getCapabilitiesForModel("kiro", "claude-sonnet-5-thinking-agentic")).toMatchObject(claudeSonnet5Expected);
  });

  it("reports Kiro GPT 5.6 models with the Kiro 272k context window", () => {
    expect(getCapabilitiesForModel("kiro", "gpt-5.6-sol")).toMatchObject(kiroGpt56Expected);
    expect(getCapabilitiesForModel("kiro", "openai/gpt-5.6-sol")).toMatchObject(kiroGpt56Expected);
    expect(getCapabilitiesForModel("kiro", "gpt-5.6-terra-thinking")).toMatchObject(kiroGpt56Expected);
    expect(getCapabilitiesForModel("kiro", "gpt-5.6-luna-agentic")).toMatchObject(kiroGpt56Expected);
    expect(getCapabilitiesForModel("kiro", "gpt-5.6-sol-thinking-agentic")).toMatchObject(kiroGpt56Expected);
  });

  it("reports Codex GPT 6.0 Astra as a vision and thinking capable model", () => {
    expect(getCapabilitiesForModel("codex", "gpt-6-astra")).toMatchObject({
      vision: true,
      reasoning: true,
      search: true,
      thinkingFormat: "openai",
      contextWindow: 272000,
      maxOutput: 128000,
    });
  });

  it("CommandCode v4.1-flash is vision + effort capable", () => {
    expect(getCapabilitiesForModel("commandcode", "deepseek/deepseek-v4.1-flash")).toMatchObject({
      vision: true,
      reasoning: true,
      thinkingFormat: "commandcode",
      thinkingEffortSupported: true,
    });
  });

  it("CommandCode MiniMax-M3 is vision capable", () => {
    expect(getCapabilitiesForModel("commandcode", "MiniMaxAI/MiniMax-M3").vision).toBe(true);
  });

  it("CommandCode text-only DeepSeek V4 Flash stays non-vision", () => {
    expect(getCapabilitiesForModel("commandcode", "deepseek/deepseek-v4-flash").vision).toBe(false);
    expect(getCapabilitiesForModel("commandcode", "deepseek/deepseek-v4-flash")).toMatchObject({
      reasoning: true,
      thinkingFormat: "commandcode",
      thinkingEffortSupported: true,
    });
  });
});

describe("getCapabilitiesForModel — MiMo (<think>-tag reasoning, always-on)", () => {
  it("mimo-v2.5 has vision + reasoning from the pattern; the wire shape is provider-scoped", () => {
    const caps = getCapabilitiesForModel(null, "mimo-v2.5");
    expect(caps.vision).toBe(true);
    expect(caps.reasoning).toBe(true);
    // A model-name glob no longer decides the thinking wire format (I2) — the
    // vendor that fronts the API declares it.
    expect(caps.thinkingFormat).toBeNull();
    expect(getCapabilitiesForModel("xiaomi-mimo", "mimo-v2.5").thinkingFormat).toBe("deepseek");
  });

  it("mimo-v2.5-pro has vision (matches *mimo*v2.5* pattern)", () => {
    const caps = getCapabilitiesForModel(null, "mimo-v2.5-pro");
    expect(caps.vision).toBe(true);
    expect(caps.reasoning).toBe(true);
    expect(caps.thinkingFormat).toBeNull();
  });

  it("xiaomi/mimo-v2.5-pro (vendor-prefixed) has vision", () => {
    const caps = getCapabilitiesForModel(null, "xiaomi/mimo-v2.5-pro");
    expect(caps.vision).toBe(true);
    expect(caps.thinkingFormat).toBeNull();
  });

  it("mimo-omni-x has audioInput via the omni pattern", () => {
    const caps = getCapabilitiesForModel(null, "mimo-omni-x");
    expect(caps.vision).toBe(true);
    expect(caps.audioInput).toBe(true);
    expect(caps.reasoning).toBe(true);
  });

  it("generic mimo has vision + reasoning (fallback pattern)", () => {
    const caps = getCapabilitiesForModel(null, "mimo");
    expect(caps.vision).toBe(true);
    expect(caps.reasoning).toBe(true);
  });
});

describe("getCapabilitiesForModel — Qwen max/plus vision", () => {
  it("qwen3.7-max has vision (*qwen*max* fires before *qwen3.7*)", () => {
    const caps = getCapabilitiesForModel(null, "qwen3.7-max");
    expect(caps.vision).toBe(true);
    expect(caps.reasoning).toBe(true);
  });

  it("Qwen3.6-Max-Preview has vision (case-insensitive pattern match)", () => {
    const caps = getCapabilitiesForModel(null, "Qwen3.6-Max-Preview");
    expect(caps.vision).toBe(true);
  });

  it("qwen3.7-plus has vision", () => {
    const caps = getCapabilitiesForModel(null, "qwen3.7-plus");
    expect(caps.vision).toBe(true);
  });

  it("qwen3.7 has vision from the qwen3.7 pattern", () => {
    const caps = getCapabilitiesForModel(null, "qwen3.7");
    expect(caps.vision).toBe(true);
  });

  it("qwq has no vision (thinking-only model)", () => {
    const caps = getCapabilitiesForModel(null, "qwq-32b");
    expect(caps.vision).toBe(false);
    expect(caps.reasoning).toBe(true);
    // No vendor declared a shape for this id → the client's value is forwarded
    // untouched; thinkingCanDisable stays at its permissive default.
    expect(caps.thinkingFormat).toBeNull();
    expect(caps.thinkingCanDisable).toBe(true);
  });
});

describe("getCapabilitiesForModel — MiniMax M2.x vision", () => {
  it("minimax-m2.7 has vision", () => {
    const caps = getCapabilitiesForModel(null, "minimax-m2.7");
    expect(caps.vision).toBe(true);
    expect(getCapabilitiesForModel("minimax", "minimax-m2.7").thinkingFormat).toBe("minimax");
  });

  it("minimax-m2.5 has vision", () => {
    const caps = getCapabilitiesForModel(null, "minimax-m2.5");
    expect(caps.vision).toBe(true);
    expect(getCapabilitiesForModel("minimax-cn", "minimax-m2.5").thinkingFormat).toBe("minimax");
  });

  it("MiniMax-M2.7 has vision (vendor prefix MiniMaxAI/ stripped by route)", () => {
    const caps = getCapabilitiesForModel(null, "MiniMaxAI/MiniMax-M2.7");
    expect(caps.vision).toBe(true);
  });

  it("minimax-m3 has vision (separate pattern)", () => {
    const caps = getCapabilitiesForModel(null, "minimax-m3");
    expect(caps.vision).toBe(true);
  });
});

describe("getCapabilitiesForModel — DeepSeek V4 text-only", () => {
  it("deepseek-v4-pro has no vision", () => {
    const caps = getCapabilitiesForModel(null, "deepseek-v4-pro");
    expect(caps.vision).toBe(false);
    expect(caps.reasoning).toBe(true);
    // Shape comes from the deepseek vendor entry, never from the model id (I2).
    expect(caps.thinkingFormat).toBeNull();
    expect(getCapabilitiesForModel("deepseek", "deepseek-v4-pro").thinkingFormat).toBe("deepseek");
  });

  it("deepseek-v4-flash has no vision", () => {
    const caps = getCapabilitiesForModel(null, "deepseek-v4-flash");
    expect(caps.vision).toBe(false);
    expect(caps.reasoning).toBe(true);
  });

  it("deepseek/deepseek-v4-pro (vendor-prefixed) has no vision", () => {
    const caps = getCapabilitiesForModel(null, "deepseek/deepseek-v4-pro");
    expect(caps.vision).toBe(false);
  });
});

describe("getCapabilitiesForModel — codebuddy-cn provider overrides", () => {
  it("deepseek-v4-pro via codebuddy-cn uses openai thinking format", () => {
    const caps = getCapabilitiesForModel("codebuddy-cn", "deepseek-v4-pro");
    expect(caps.vision).toBe(true);
    expect(caps.reasoning).toBe(true);
    expect(caps.thinkingFormat).toBe("openai");
    expect(caps.thinkingCanDisable).toBe(true);
  });

  it("minimax-m3 via codebuddy-cn has vision (provider override)", () => {
    const caps = getCapabilitiesForModel("codebuddy-cn", "minimax-m3");
    expect(caps.vision).toBe(true);
    expect(caps.thinkingFormat).toBe("openai");
    expect(caps.thinkingCanDisable).toBe(false);
  });

  it("unknown provider resolves no thinking shape from the model id (I2)", () => {
    const caps = getCapabilitiesForModel("unknown-provider", "mimo-v2.5");
    expect(caps.vision).toBe(true);
    expect(caps.reasoning).toBe(true);
    expect(caps.thinkingFormat).toBeNull();
  });

  it("opencode-go claude-haiku-5-5 uses adaptive thinking, other haiku ids stay budget", () => {
    // OpenCode Go rejects `thinking.type.enabled` for this model (400) and asks for
    // thinking.type.adaptive + output_config.effort, which claude-adaptive emits.
    const haiku55 = getCapabilitiesForModel("opencode-go", "claude-haiku-5-5");
    expect(haiku55.thinkingFormat).toBe("claude-adaptive");
    expect(haiku55.reasoning).toBe(true);
    expect(haiku55.vision).toBe(true);
    // The upstream catalog reports context_length 1000000 for this id; without the
    // explicit value the provider entry does NOT inherit MODEL_CAPABILITIES (it is
    // spread over DEFAULT_CAPABILITIES only) and the model shows 200k. maxOutput is
    // stated for the same reason: the override short-circuits before the catalog
    // overlay, so the synced catalog's 128000 would never be applied otherwise.
    expect(haiku55.contextWindow).toBe(1000000);
    expect(haiku55.maxOutput).toBe(128000);

    // The override is provider-scoped: the global haiku pattern (claude-budget) still
    // governs every other provider, including the bare/anthropic lookup.
    expect(getCapabilitiesForModel(undefined, "claude-haiku-5-5").thinkingFormat).toBe("claude-budget");
    expect(getCapabilitiesForModel("claude", "claude-haiku-5-5").thinkingFormat).toBe("claude-budget");
    expect(getCapabilitiesForModel("opencode-go", "claude-haiku-4-5-20251001").thinkingFormat).toBe("claude-budget");
  });

  it("commandcode claude-haiku-5-5 is pinned to the catalog limits, not the fallback", () => {
    // The commandcode branch returns 1M/384k for every unlisted model — for this id
    // that fallback happened to guess the context right, but only by accident: the
    // provider catalog (GET api.commandcode.ai/provider/v1/models) reports
    // context_length 1000000 with maxOutput 128000 (claude-haiku-4-5 stays 200000).
    // The explicit entry pins maxOutput and keeps thinking on the commandcode path.
    const caps = getCapabilitiesForModel("commandcode", "claude-haiku-5-5");
    expect(caps.contextWindow).toBe(1000000);
    expect(caps.maxOutput).toBe(128000);
    expect(caps.thinkingFormat).toBe("commandcode");
    expect(caps.vision).toBe(true);
    // the generic fallback still governs unlisted commandcode models
    expect(getCapabilitiesForModel("commandcode", "deepseek/deepseek-v4.1-flash")).toMatchObject({
      contextWindow: 1000000,
      maxOutput: 384000,
    });
  });
});

describe("OpenCode Free ids newer than the capability tables", () => {
  // The reasoning badge here is display-only metadata (UI picker); the outbound
  // body no longer depends on it — applyThinking() never deletes client params
  // based on capabilities (#2690 is fixed by the provider-scoped redesign).
  // Modalities/limits are taken verbatim from models.dev.
  it("reports reasoning and the models.dev limits for space-bunny", () => {
    expect(getCapabilitiesForModel(undefined, "space-bunny-free")).toMatchObject({
      reasoning: true,
      contextWindow: 1048576,
      maxOutput: 524288,
    });
    expect(getCapabilitiesForModel("opencode-go", "space-bunny")).toMatchObject({
      reasoning: true,
      contextWindow: 1048576,
      maxOutput: 524288,
    });
  });

  it("keeps per-id modalities and limits instead of a generic floor", () => {
    // text-only, small context — a shared pattern rule would overstate both.
    expect(getCapabilitiesForModel(undefined, "big-pickle")).toMatchObject({
      reasoning: true,
      vision: false,
      contextWindow: 200000,
      maxOutput: 32000,
    });
    expect(getCapabilitiesForModel(undefined, "ring-2.6-1t-free")).toMatchObject({
      reasoning: true,
      vision: false,
      contextWindow: 262000,
      maxOutput: 66000,
    });
    expect(getCapabilitiesForModel(undefined, "exo-free")).toMatchObject({
      reasoning: true,
      vision: true,
      contextWindow: 1048576,
      maxOutput: 131072,
    });
  });
});

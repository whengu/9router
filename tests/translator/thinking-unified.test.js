// Unit tests for thinking passthrough (thinkingUnified.js).
//
// Contract (DECISIONS.md D10 / REQUIREMENTS §4.0 — 至高原则):
//   N0 出站 thinking 字段与客户端入站逐一相等（字段名、嵌套、值均不变）。
//   N1 任意自定义 provider + 任意模型 ID + 任意档位/budget → 出站值 == 入站值。
//   N4 客户端完全沉默时，不注入任何思考默认值。
//   N5 请求期后缀 model(level) 覆盖一切默认值，且只以客户端自身形状写回、值保值。
//   N6 未知 vendor 字段（chat_template_kwargs 等）不得被删除。
// 历史上本文件覆盖的是 per-provider 形状翻译（applyFormat/resolveFormat/钳制），
// 该翻译层已按 D10 整体删除；相关用例随之移除。
import { describe, it, expect } from "vitest";
import {
  parseSuffix,
  extractThinking,
  suffixThinkingValue,
  applyThinking,
} from "../../open-sse/translator/concerns/thinkingUnified.js";

const apply = (sourceFormat, model, body) => {
  const b = JSON.parse(JSON.stringify(body));
  applyThinking(sourceFormat, model, b);
  return b;
};

describe("parseSuffix", () => {
  it("parses level suffix", () => {
    expect(parseSuffix("gpt-5(high)")).toEqual({ cleanModel: "gpt-5", override: { mode: "level", level: "high" } });
  });
  it("parses ultra suffix", () => {
    expect(parseSuffix("gpt-5.6-sol(ultra)")).toEqual({
      cleanModel: "gpt-5.6-sol",
      override: { mode: "level", level: "ultra" },
    });
  });
  it("parses numeric budget suffix", () => {
    expect(parseSuffix("model(8192)")).toEqual({ cleanModel: "model", override: { mode: "budget", budget: 8192 } });
  });
  it("parses auto / none", () => {
    expect(parseSuffix("m(auto)").override).toEqual({ mode: "auto" });
    expect(parseSuffix("m(none)").override).toEqual({ mode: "none" });
  });
  it("no suffix → passthrough", () => {
    expect(parseSuffix("claude-opus-4.7")).toEqual({ cleanModel: "claude-opus-4.7", override: null });
  });
});

describe("extractThinking (read-only intent reader)", () => {
  it("claude enabled+budget", () => {
    expect(extractThinking({ thinking: { type: "enabled", budget_tokens: 4096 } })).toEqual({ mode: "budget", budget: 4096 });
  });
  it("claude disabled", () => {
    expect(extractThinking({ thinking: { type: "disabled" } })).toEqual({ mode: "none" });
  });
  it("openai reasoning_effort", () => {
    expect(extractThinking({ reasoning_effort: "high" })).toEqual({ mode: "level", level: "high" });
  });
  it("responses reasoning.effort none", () => {
    expect(extractThinking({ reasoning: { effort: "none" } })).toEqual({ mode: "none" });
  });
  it("gemini thinkingBudget 0 → none", () => {
    expect(extractThinking({ thinkingConfig: { thinkingBudget: 0 } })).toEqual({ mode: "none" });
  });
  it("qwen enable_thinking false", () => {
    expect(extractThinking({ enable_thinking: false })).toEqual({ mode: "none" });
  });
  it("no intent → null", () => {
    expect(extractThinking({ messages: [] })).toBeNull();
  });
});

describe("suffixThinkingValue (verbatim, no conversion)", () => {
  it("level stays a level string", () => {
    expect(suffixThinkingValue("m(max)")).toBe("max");
    expect(suffixThinkingValue("m(ultra)")).toBe("ultra");
  });
  it("budget stays a number", () => {
    expect(suffixThinkingValue("m(8192)")).toBe(8192);
  });
  it("none/auto stay strings", () => {
    expect(suffixThinkingValue("m(none)")).toBe("none");
    expect(suffixThinkingValue("m(auto)")).toBe("auto");
  });
  it("no suffix → null", () => {
    expect(suffixThinkingValue("gpt-5")).toBeNull();
  });
});

describe("applyThinking — 透传契约（D10）", () => {
  // ── N0/N1: client values ride through untouched ──────────────────────────
  it("openai client effort passes through verbatim for an undeclared provider", () => {
    const out = apply("openai", "glm-5.3", { reasoning_effort: "max", messages: [] }, "my-node");
    expect(out.reasoning_effort).toBe("max");
  });

  it("openai client effort passes through verbatim on a vendor that used to be shaped (z.ai/kimi/deepseek)", () => {
    for (const provider of ["glm", "glm-cn", "kimi", "deepseek", "minimax", "muse"]) {
      const out = apply("openai", "glm-5.3", { reasoning_effort: "max" }, provider);
      expect(out.reasoning_effort).toBe("max");
    }
  });

  it("max is never clamped to xhigh/high (钳制已删除)", () => {
    const out = apply("openai", "gpt-5", { reasoning_effort: "max" }, "openai");
    expect(out.reasoning_effort).toBe("max");
  });

  it("claude client thinking object passes through verbatim", () => {
    const body = { thinking: { type: "enabled", budget_tokens: 45000 }, messages: [] };
    const out = apply("claude", "glm-5.3", body, "my-node");
    expect(out.thinking).toEqual({ type: "enabled", budget_tokens: 45000 });
  });

  it("responses reasoning.effort + summary pass through verbatim (summary not reset)", () => {
    const body = { reasoning: { effort: "high", summary: "detailed" }, input: [] };
    const out = apply("openai-responses", "muse-spark-1.3", body, "muse");
    expect(out.reasoning).toEqual({ effort: "high", summary: "detailed" });
  });

  it("unknown vendor fields are preserved (N6)", () => {
    const body = { reasoning_effort: "high", chat_template_kwargs: { enable_thinking: true } };
    const out = apply("openai", "glm-5.3", body, "my-node");
    expect(out.chat_template_kwargs).toEqual({ enable_thinking: true });
  });

  it("none stays none — never upgraded, never dropped, on any provider", () => {
    for (const provider of ["my-node", "glm", "codebuddy-cn", "nvidia"]) {
      const out = apply("openai", "glm-5.3", { reasoning_effort: "none" }, provider);
      expect(out.reasoning_effort).toBe("none");
    }
  });

  it("an unknown model id does not lose the client's thinking config (旧 stripAll 已删除)", () => {
    const out = apply("openai", "totally-unknown-model-xyz", { reasoning_effort: "high" }, "my-node");
    expect(out.reasoning_effort).toBe("high");
  });

  // ── N4: silence stays silence ────────────────────────────────────────────
  it("no thinking fields and no suffix → body untouched, no default injected", () => {
    const body = { messages: [{ role: "user", content: "hi" }] };
    const out = apply("openai", "glm-5.3", body, "glm");
    expect(out).toEqual(body);
    expect(out.reasoning_effort).toBeUndefined();
    expect(out.thinking).toBeUndefined();
  });

  // ── N5: explicit suffix wins, written in the CLIENT's own shape ──────────
  it("openai client + (high) → reasoning_effort verbatim", () => {
    const out = apply("openai", "glm-5.3(high)", { messages: [] }, "my-node");
    expect(out.reasoning_effort).toBe("high");
  });

  it("openai client + (max) → max verbatim (no xhigh clamp)", () => {
    const out = apply("openai", "glm-5.3(max)", { messages: [] }, "glm");
    expect(out.reasoning_effort).toBe("max");
  });

  it("openai client + (8192) → number stays a number (no level quantization)", () => {
    const out = apply("openai", "glm-5.3(8192)", { messages: [] }, "my-node");
    expect(out.reasoning_effort).toBe(8192);
  });

  it("openai client + (none) → none verbatim", () => {
    const out = apply("openai", "glm-5.3(none)", { messages: [] }, "glm");
    expect(out.reasoning_effort).toBe("none");
  });

  it("claude client + (8192) → thinking budget_tokens verbatim", () => {
    const out = apply("claude", "glm-5.3(8192)", { messages: [] }, "my-node");
    expect(out.thinking).toEqual({ type: "enabled", budget_tokens: 8192 });
  });

  it("claude client + (high) → thinking enabled + output_config effort verbatim", () => {
    const out = apply("claude", "claude-opus-4.7(high)", { messages: [] }, "claude");
    expect(out.thinking).toEqual({ type: "enabled" });
    expect(out.output_config).toEqual({ effort: "high" });
  });

  it("claude client + (none) → thinking disabled", () => {
    const out = apply("claude", "glm-5.3(none)", { messages: [] }, "my-node");
    expect(out.thinking).toEqual({ type: "disabled" });
  });

  it("responses client + (high) → nested reasoning.effort, other reasoning fields kept", () => {
    const out = apply("openai-responses", "muse-spark-1.3(high)", { reasoning: { summary: "detailed" } }, "muse");
    expect(out.reasoning).toEqual({ summary: "detailed", effort: "high" });
    expect(out.reasoning_effort).toBeUndefined();
  });

  it("gemini client + (8192) → thinkingBudget verbatim", () => {
    const out = apply("gemini", "gemini-3-pro(8192)", { contents: [] }, "gemini");
    expect(out.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 8192 });
  });

  it("suffix overrides a client-sent value (I5: 后缀 > 客户端字段)", () => {
    const out = apply("openai", "glm-5.3(high)", { reasoning_effort: "low" }, "my-node");
    expect(out.reasoning_effort).toBe("high");
  });

  it("suffix only writes the client's own field — no vendor shape is invented", () => {
    const out = apply("openai", "glm-5.3(high)", { messages: [] }, "glm");
    expect(Object.keys(out).sort()).toEqual(["messages", "reasoning_effort"]);
  });

  // ── 不变量固化 ───────────────────────────────────────────────────────────
  it("invariant N1: any provider × any model × any value → out == in", () => {
    const providers = ["my-node", "glm", "glm-cn", "kimi", "kimchi", "deepseek", "minimax", "muse", "opencode-go", "nvidia"];
    const models = ["glm-5.3", "kimi-k3", "deepseek-v4", "unknown-xyz", "claude-haiku-4.5"];
    for (const provider of providers) {
      for (const model of models) {
        const out = apply("openai", model, { reasoning_effort: "max" }, provider);
        expect(out.reasoning_effort).toBe("max");
      }
    }
  });

  it("invariant N2: an undeclared provider/model resolves no thinking shape from the model name", async () => {
    const { getCapabilitiesForModel } = await import("../../open-sse/providers/capabilities.js");
    expect(getCapabilitiesForModel("my-node", "glm-5.3").thinkingFormat).toBeNull();
  });

  it("invariant N6: stripAll-era field deletion is gone — nothing but the suffix is written", () => {
    const body = {
      messages: [],
      reasoning_effort: "high",
      thinking_budget: 1234,
      enable_thinking: true,
      chat_template_kwargs: { temperature: 0.5 },
      output_config: { effort: "low" },
    };
    const out = apply("openai", "glm-5.3", body, "my-node");
    expect(out).toEqual(body);
  });
});

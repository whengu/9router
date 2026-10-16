import { describe, expect, it } from "vitest";

import { applyThinking } from "../../open-sse/translator/concerns/thinkingUnified.js";

// #4409 history: z.ai rejects `thinking.type:"disabled"` / `enable_thinking:false`
// on the GLM-5.3 line ("GLM-5.3 and GLM-5.3-FLASH no longer support disabling
// thinking"). The old gateway "protected" users by silently forcing thinking ON
// (thinkingCanDisable:false gate) — i.e. it overwrote the client's explicit ask.
//
// D10 至高原则: that gate is gone. The client's disable request is forwarded
// verbatim; if z.ai answers 400 code 1210, the error reaches the client as-is
// (I4/D2 — "用户配置引发的错误由用户自己处理，网关不篡改").
const models = ["glm-5.3-flash", "glm-5.3"];

describe("GLM 5.3 disable requests are forwarded verbatim (#4409, D10)", () => {
  it.each([
    ["reasoning_effort: none", { reasoning_effort: "none" }],
    ["reasoning_effort: off", { reasoning_effort: "off" }],
    ["thinking.type: disabled", { thinking: { type: "disabled" } }],
  ])("%s passes through unchanged on every glm model", (_label, seed) => {
    for (const id of models) {
      const body = structuredClone(seed);
      applyThinking("claude", id, body, "glm");
      expect(body, id).toEqual(seed);
    }
  });

  it.each(models)("%s keeps a normal request's own thinking intact", (id) => {
    const body = { thinking: { type: "enabled" } };
    applyThinking("claude", id, body, "glm");
    expect(body.thinking).toEqual({ type: "enabled" });
  });

  it("no capability gate may rewrite a client's disable ask on any model", () => {
    for (const id of ["glm-5.3", "glm-5.3-flash", "glm-5.2", "glm-5.1", "glm-5-turbo"]) {
      const body = { reasoning_effort: "none" };
      applyThinking("claude", id, body, "glm");
      expect(body.reasoning_effort, id).toBe("none");
    }
  });
});

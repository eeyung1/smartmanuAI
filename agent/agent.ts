import { defineAgent } from "eve";
import { mockModel } from "eve/evals";
import { fixtureExtraction } from "../src/research/fixture";
// Dedicated fixture runtime: no live provider and no network fallback.
export default defineAgent({
  defaultTools: false,
  model: mockModel(({ tools, toolResults }) => {
    const names = tools.map((t) => t.name);
    if (names.some((name) => name !== "read_fixture" && name !== "eve__reply"))
      throw new Error("Unexpected model capability: " + names.join(","));
    if (!toolResults.length)
      return {
        toolCalls: [{ name: "read_fixture", input: {} }],
        usage: { inputTokens: 100, outputTokens: 50 },
      };
    return {
      text: JSON.stringify(fixtureExtraction),
      usage: { inputTokens: 100, outputTokens: 50 },
    };
  }),
  limits: {
    sessionUsage: ({ total }) =>
      total.inputTokens >= 12000 || total.outputTokens >= 2000,
    sessionTimeoutMs: 300000,
  },
});

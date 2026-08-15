import { describe, expect, it } from "vitest";
import { toolResultPayloadCandidates } from "../../web/src/tool-result.js";

const envelope = {
  dataset_version: "test-v1",
  data: { id: "recipe-1" },
  next_cursor: null,
  sources: [],
  coverage_warnings: [],
  checked_at: "2026-08-15T00:00:00.000Z",
};

describe("toolResultPayloadCandidates", () => {
  it("préfère le structuredContent MCP standard", () => {
    expect(toolResultPayloadCandidates({ structuredContent: envelope })[0]).toEqual(envelope);
  });

  it("récupère le même contrat JSON depuis le bloc texte du pont ChatGPT", () => {
    const candidates = toolResultPayloadCandidates({
      content: [{ type: "text", text: JSON.stringify(envelope) }],
    });
    expect(candidates).toEqual([envelope]);
  });

  it("ignore les contenus texte non JSON sans fabriquer de données", () => {
    expect(toolResultPayloadCandidates({ content: [{ type: "text", text: "indisponible" }] })).toEqual([]);
  });
});

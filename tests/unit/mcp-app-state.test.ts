import { describe, expect, it } from "vitest";
import { shouldReplayHostToolOutput } from "../../src/mcp-app-state.js";

describe("état de l’app MCP", () => {
  it("restaure le résultat d’outil uniquement au premier chargement", () => {
    expect(shouldReplayHostToolOutput(false, { data: "galerie" })).toBe(true);
    expect(shouldReplayHostToolOutput(true, { data: "galerie" })).toBe(false);
    expect(shouldReplayHostToolOutput(false, undefined)).toBe(false);
  });
});

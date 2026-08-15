import { describe, expect, it } from "vitest";
import { normalizeRecipeDiscoveryQuery } from "../../src/recipe-discovery-query.js";

describe("normalizeRecipeDiscoveryQuery", () => {
  it.each([
    "6 recettes vegan",
    "propose-moi 6 recettes véganes",
    "Montrez-nous quelques recettes végétaliennes",
  ])("retire une demande générique de découverte : %s", (query) => {
    expect(normalizeRecipeDiscoveryQuery(query)).toBeUndefined();
  });

  it("conserve uniquement les critères culinaires utiles", () => {
    expect(normalizeRecipeDiscoveryQuery("Propose-moi 6 recettes vegan au curry de pois chiches")).toBe("curry pois chiches");
  });
});

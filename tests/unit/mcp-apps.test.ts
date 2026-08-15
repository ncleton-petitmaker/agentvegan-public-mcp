import { describe, expect, it } from "vitest";
import { nutritionComparisonForUi, productCardForUi, recipeCardForUi, recipeDetailForUi } from "../../src/mcp-apps.js";

describe("projection MCP Apps", () => {
  it("normalise les images d’étapes vers le domaine public", () => {
    const recipe = recipeDetailForUi({
      id: "recette-test",
      slug: "recette-test",
      title: "Recette test",
      image_url: "https://agentvegan.org/photo.webp",
      guide: { steps: [{ id: "etape-1", image: "/_agentvegan/photos/etape.webp" }] },
    });
    expect(recipe).toMatchObject({
      guide: { steps: [{ image: "https://agentvegan.org/_agentvegan/photos/etape.webp" }] },
    });
  });

  it("ne conserve dans les cartes que les URL distantes et métadonnées utiles", () => {
    expect(recipeCardForUi({ id: "r", slug: "r", title: "R", image_url: "https://agentvegan.org/r.webp", nutrition: { priority_scores: [] } })).toMatchObject({ id: "r", image_url: "https://agentvegan.org/r.webp", nutrition: [] });
    expect(productCardForUi({ id: "p", name: "P", image_url: "https://cdn.greenweez.com/p.webp", offers: [] })).toMatchObject({ id: "p", image_url: "https://cdn.greenweez.com/p.webp", offers: [] });
  });

  it("uniformise les nutriments ingrédients et recettes sans inventer de valeurs", () => {
    const view = nutritionComparisonForUi({
      basis: "100_g",
      comparisons: [
        { entity_type: "ingredient", id: "tofu", name: "Tofu", nutrients: { protein_g: { min: 12, max: 14, unit: "g", method: "source" } } },
        { entity_type: "ingredient", id: "seitan", name: "Seitan", nutrients: { protein_g: { min: 24, max: 24, unit: "g", method: "source" } } },
      ],
    });
    expect(view).toMatchObject({
      view: "nutrition_comparison",
      basis: "100_g",
      series: [
        { name: "Tofu", nutrients: [{ id: "protein_g", min: 12, max: 14, unit: "g" }] },
        { name: "Seitan", nutrients: [{ id: "protein_g", min: 24, max: 24, unit: "g" }] },
      ],
    });
  });
});

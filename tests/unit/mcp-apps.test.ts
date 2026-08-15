import { describe, expect, it } from "vitest";
import { nutritionComparisonForUi, productCardForUi, recipeCardForUi, recipeDetailForUi } from "../../src/mcp-apps.js";

describe("projection MCP Apps", () => {
  it("normalise les images d’étapes vers le domaine public", () => {
    const recipe = recipeDetailForUi({
      id: "recette-test",
      slug: "recette-test",
      title: "Recette test",
      image_url: "https://agentvegan.org/photo.webp",
      guide: { steps: [{ id: "etape-1", beginner_instruction: "Mélange doucement.", image: "/_agentvegan/photos/etape.webp", image_alt: "Mélange dans un saladier" }] },
    });
    expect(recipe).toMatchObject({
      guide: { steps: [{ beginner_instruction: "Mélange doucement.", image: "https://agentvegan.org/_agentvegan/photos/etape.webp", image_alt: "Mélange dans un saladier" }] },
    });
  });

  it("conserve toutes les étapes publiques, leurs textes et leurs images", () => {
    const recipe = recipeDetailForUi({
      id: "recette-complete",
      slug: "recette-complete",
      title: "Recette complète",
      image_url: "https://agentvegan.org/plat.webp",
      guide: {
        steps: [
          { id: "s1", beginner_instruction: "Coupe les légumes.", image: "/_agentvegan/photos/s1.webp", image_alt: "Légumes coupés" },
          { id: "s2", beginner_instruction: "Fais-les cuire dix minutes.", image: "/_agentvegan/photos/s2.webp", image_alt: "Légumes dans la poêle" },
        ],
      },
    }) as { guide: { steps: Array<{ beginner_instruction: string; image: string }> } };
    expect(recipe.guide.steps).toHaveLength(2);
    expect(recipe.guide.steps.map((step) => step.beginner_instruction)).toEqual(["Coupe les légumes.", "Fais-les cuire dix minutes."]);
    expect(recipe.guide.steps.every((step) => step.image.startsWith("https://agentvegan.org/"))).toBe(true);
  });

  it("refuse une recette dont une étape n’a pas de texte ou d’image publique", () => {
    const base = { id: "r", slug: "r", title: "R", image_url: "https://agentvegan.org/r.webp" };
    expect(() => recipeDetailForUi({ ...base, guide: { steps: [{ id: "s", image: "/s.webp" }] } })).toThrow(/instruction publique/u);
    expect(() => recipeDetailForUi({ ...base, guide: { steps: [{ id: "s", beginner_instruction: "Cuire." }] } })).toThrow(/Image publique/u);
  });

  it("ne conserve dans les cartes que les URL distantes et métadonnées utiles", () => {
    expect(recipeCardForUi({ id: "r", slug: "r", title: "R", image_url: "https://agentvegan.org/r.webp", servings_count: 4, step_count: 6, nutrition: { priority_scores: [] } })).toMatchObject({ id: "r", image_url: "https://agentvegan.org/r.webp", servings_count: 4, step_count: 6, nutrition: [] });
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

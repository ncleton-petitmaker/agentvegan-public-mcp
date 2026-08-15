import { describe, expect, it } from "vitest";
import type { PlantProduct, SubstitutionRule } from "../../src/contracts.js";
import { commercialSubstituteForUi, culinarySubstituteForUi, resolveSubstituteCategory } from "../../src/substitute-explorer.js";

describe("explorateur de substituts", () => {
  it("route une demande naturelle sur la catégorie poulet végétal", () => {
    expect(resolveSubstituteCategory("propose-moi un substitut au poulet")).toMatchObject({ id: "poulet-vegetal" });
    expect(resolveSubstituteCategory("alternative aux nuggets de poulet")).toMatchObject({ id: "poulet-vegetal" });
  });

  it("calcule le score commercial uniquement à partir de preuves publiques", () => {
    const category = resolveSubstituteCategory("poulet");
    expect(category).not.toBeNull();
    const product = {
      id: "plant-test",
      name: "Émincés végétaux",
      brand: "Test",
      category_id: "poulet-vegetal",
      image_url: "https://example.test/product.png",
      last_seen_at: "2026-08-14T10:00:00.000Z",
      nutrition: {
        status: "complete",
        basis: "100g",
        values: { energy_kcal: 180, proteins_g: 18, salt_g: 1.1 },
        display_nutri_score: { grade: "b", score: 2, version: "2023", provider: "AgentVegan", estimated: true, source_class: "agentvegan_estimate", origin: "agentvegan_official_algorithm_estimate", method: "estimated" },
      },
      offers: [{ retailer_id: "retailer", availability: "in_stock", checked_at: "2026-08-14T10:00:00.000Z", vegan_proof: "mention_expresse", product_url: "https://example.test/product", price_cents: 399 }],
    } satisfies PlantProduct;
    const result = commercialSubstituteForUi(product, category!, "2026-08-14T17:00:00.000Z");
    expect(result).toMatchObject({ score: 100, nutrition_status: "complete", nutrition: { display_nutri_score: { grade: "b" } } });
    expect(result.score_criteria).toHaveLength(5);
  });

  it("refuse un produit commercial sans Nutri-Score public traçable", () => {
    const category = resolveSubstituteCategory("poulet");
    const product = { id: "plant-incomplet", name: "Produit incomplet", offers: [] } satisfies PlantProduct;
    expect(() => commercialSubstituteForUi(product, category!, "2026-08-14T17:00:00.000Z")).toThrow(/Nutri-Score public absent/u);
  });

  it("ne présente jamais la documentation culinaire comme une note nutritionnelle", () => {
    const rule = {
      id: "substitution-test",
      kind: "remplacement_culinaire_fonctionnel",
      ingredient_id: "ingredient-test",
      replacement_ingredient_id: "ingredient-replacement",
      replacement_name: "remplacement documenté",
      source_id: "source-test",
      quantity_conversion: "100 g pour 100 g",
      culinary_rationale: "Même fonction dans cette préparation.",
      contexts: ["wok"],
    } satisfies SubstitutionRule;
    expect(culinarySubstituteForUi(rule)).toMatchObject({ score: 100, nutrition_status: "not_compared" });
  });
});

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PublicCatalog, PublicManifest, PublicResponse } from "../../src/contracts.js";
import { PublicDataError } from "../../src/errors.js";
import { JsonCatalogRepository } from "../../src/repository-json.js";
import { PublicDataService } from "../../src/service.js";

let service: PublicDataService;

beforeAll(async () => {
  const [catalog, manifest] = await Promise.all([
    readFile(resolve("data/catalog.json"), "utf8").then((value) => JSON.parse(value) as PublicCatalog),
    readFile(resolve("data/manifest.json"), "utf8").then((value) => JSON.parse(value) as PublicManifest),
  ]);
  service = new PublicDataService(new JsonCatalogRepository(catalog, manifest), () => new Date("2026-08-15T12:00:00.000Z"));
});

function expectEnvelope(response: PublicResponse): void {
  expect(response).toEqual(expect.objectContaining({
    dataset_version: expect.stringMatching(/^agentvegan-public-data-v1-/u),
    data: expect.anything(),
    sources: expect.any(Array),
    coverage_warnings: expect.any(Array),
    checked_at: expect.stringMatching(/^2026-/u),
  }));
  expect("next_cursor" in response).toBe(true);
}

describe("PublicDataService", () => {
  it("trouve une recette riche en fer en moins de 30 minutes", async () => {
    const response = await service.searchRecipes({ nutrient: "iron_mg", nutrient_minimum: 5, max_time_minutes: 30, limit: 10 });
    expectEnvelope(response);
    expect(Array.isArray(response.data)).toBe(true);
    expect((response.data as unknown[]).length).toBeGreaterThan(0);
  });

  it("conserve les minimums nutritionnels sans bandeau global redondant", async () => {
    const search = await service.searchRecipes({ limit: 50 });
    const recipes = search.data as Array<{ id: string }>;
    let detail: PublicResponse | null = null;
    for (const recipe of recipes) {
      const candidate = await service.getRecipe(recipe.id);
      const scores = (candidate.data as { nutrition?: { priority_scores?: Array<{ status?: string }> } }).nutrition?.priority_scores ?? [];
      if (scores.some((score) => score.status === "sourced_lower_bound")) {
        detail = candidate;
        break;
      }
    }
    expect(detail).not.toBeNull();
    expect(detail?.coverage_warnings).toEqual([]);
  });

  it("pagine avec un curseur lié à la version", async () => {
    const first = await service.searchRecipes({ limit: 2 });
    expect(first.next_cursor).toEqual(expect.any(String));
    const second = await service.searchRecipes({ limit: 2, cursor: first.next_cursor ?? undefined });
    expect(second.data).not.toEqual(first.data);
    await expect(service.searchRecipes({ limit: 51 })).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
  });

  it("renvoie une seule ligne par enseigne pour le tahini", async () => {
    const response = await service.findStoresForIngredient({ ingredient: "tahini", status: "listed", limit: 50 });
    const evidence = (response.data as unknown as { evidence: Array<{ retailer_id: string }> }).evidence;
    expect(evidence.length).toBeGreaterThan(0);
    expect(new Set(evidence.map((item) => item.retailer_id)).size).toBe(evidence.length);
    expect(response.coverage_warnings.join(" ")).toMatch(/preuve datée/u);
  });

  it("sépare le remplacement fonctionnel d’un œuf des produits commerciaux", async () => {
    const response = await service.findSubstitutes({ ingredient: "oeuf" });
    const substitutions = (response.data as unknown as { substitutions: Array<Record<string, unknown>> }).substitutions;
    expect(substitutions).toHaveLength(1);
    expect(substitutions[0]).toMatchObject({ kind: "remplacement_culinaire_fonctionnel", recipe_id: null });
    expect(String(substitutions[0]?.quantity_conversion)).toMatch(/1 cuillère à soupe.*3 cuillères à soupe/u);
    expect(response.sources.map((source) => source.id)).toContain("substitution:usu-flax-egg");
  });

  it("compare le tofu et le seitan sur 100 g avec leurs sources", async () => {
    const response = await service.compareNutrition({ entities: ["tofu", "seitan"], basis: "100_g" });
    const comparisons = (response.data as unknown as { comparisons: Array<{ name: string; nutrients: Record<string, unknown> }> }).comparisons;
    expect(comparisons.map((item) => item.name)).toEqual(["tofu", "seitan"]);
    expect(comparisons.every((item) => "protein_g" in item.nutrients)).toBe(true);
    expect(response.sources.length).toBeGreaterThan(0);
  });

  it("refuse les bases incompatibles et les ingrédients ambigus", async () => {
    await expect(service.compareNutrition({ entities: ["tofu", "seitan"], basis: "portion" })).rejects.toMatchObject({ code: "UNSUPPORTED_BASIS" });
    await expect(service.getIngredient("tofu cuit")).rejects.toBeInstanceOf(PublicDataError);
    await expect(service.compareNutrition({ entities: ["tofu cuit", "tofu"], basis: "100_g" })).rejects.toMatchObject({ code: "AMBIGUOUS_INGREDIENT" });
  });

  it("expose une fiche directe pour chacune des huit entités", async () => {
    const catalog = JSON.parse(await readFile(resolve("data/catalog.json"), "utf8")) as PublicCatalog;
    const samples = [
      ["recipe", catalog.recipes[0]?.id],
      ["ingredient", catalog.ingredients[0]?.id],
      ["nutrient", catalog.nutrients[0]?.id],
      ["retailer", catalog.retailers[0]?.id],
      ["availability-evidence", catalog.availability_evidence[0]?.id],
      ["substitution-rule", catalog.substitution_rules[0]?.id],
      ["plant-product", catalog.plant_products[0]?.id],
      ["source-reference", catalog.source_references[0]?.id],
    ] as const;
    for (const [entity, id] of samples) {
      expect(id).toEqual(expect.any(String));
      const response = await service.getEntityRecord(entity, id ?? "");
      expectEnvelope(response);
      expect((response.data as { id: string }).id).toBe(id);
    }
  });

  it("signale un catalogue périmé sans masquer son statut", async () => {
    const [catalog, manifest] = await Promise.all([
      readFile(resolve("data/catalog.json"), "utf8").then((value) => JSON.parse(value) as PublicCatalog),
      readFile(resolve("data/manifest.json"), "utf8").then((value) => JSON.parse(value) as PublicManifest),
    ]);
    const stale = new PublicDataService(new JsonCatalogRepository(catalog, manifest), () => new Date("2027-01-01T00:00:00.000Z"));
    await expect(stale.searchRecipes({ limit: 1 })).rejects.toMatchObject({ code: "DATASET_STALE" });
    const status = await stale.getCatalogStatus();
    expect((status.data as { state: string }).state).toBe("stale");
  });
});

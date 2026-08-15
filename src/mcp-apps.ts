import { RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps";
import type { McpServer, ReadResourceResult } from "@modelcontextprotocol/server";
import type { JsonObject, JsonValue, PublicResponse } from "./contracts.js";
import { MCP_APP_HTML } from "./generated/mcp-app-html.js";

export const MCP_APP_URIS = {
  kitchen: "ui://agentvegan/kitchen/v17.html",
  plantProductGallery: "ui://agentvegan/plant-product-gallery/v17.html",
  nutritionComparison: "ui://agentvegan/nutrition-comparison/v17.html",
  ingredientExplorer: "ui://agentvegan/ingredient-explorer/v17.html",
  substituteExplorer: "ui://agentvegan/substitute-explorer/v17.html",
} as const;

export const MCP_APP_IMAGE_ORIGINS = [
  "https://agentvegan.org",
  "https://catalog-media.lafourche.fr",
  "https://cdn.greenweez.com",
  "https://koro.imgix.net",
  "https://media.houra.fr",
  "https://mescoursesenligne.lavieclaire.com",
  "https://nutri-beautiful.com",
  "https://storefront-prod.fr.picnicinternational.com",
  "https://www.biocoop.fr",
  "https://www.etiketbio.eu",
  "https://www.kazidomi.com",
  "https://www.marguerite-and-cow.fr",
  "https://www.monepicerieparis.fr",
  "https://www.officialveganshop.com",
  "https://www.plantbaseddistribution.com.au",
  "https://www.vegetalfood.fr",
  "https://www.vegetalsquare.com",
] as const;

interface UiResource {
  uri: string;
  title: string;
  description: string;
}

const UI_RESOURCES: UiResource[] = [
  { uri: MCP_APP_URIS.kitchen, title: "Agent Vegan", description: "Recettes illustrées, fiche nutritionnelle et mode cuisine pas à pas avec toutes les étapes." },
  { uri: MCP_APP_URIS.plantProductGallery, title: "Galerie de produits végétaux AgentVegan", description: "Produits végétaux illustrés et offres commerciales datées." },
  { uri: MCP_APP_URIS.nutritionComparison, title: "Comparaison nutritionnelle AgentVegan", description: "Comparaison interactive sur une base nutritionnelle explicite." },
  { uri: MCP_APP_URIS.ingredientExplorer, title: "Explorateur d’ingrédient AgentVegan", description: "Fiche ingrédient, magasins, substitutions et recettes associées." },
  { uri: MCP_APP_URIS.substituteExplorer, title: "Substituts Agent Vegan", description: "Substitutions culinaires et alternatives commerciales séparées, avec Nutri-Score visible." },
];

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function absoluteAgentVeganImage(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  if (value.startsWith("/")) return new URL(value, "https://agentvegan.org").href;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function requiredRecipeImage(value: unknown, context: string): string {
  const image = absoluteAgentVeganImage(value);
  if (!image || new URL(image).origin !== "https://agentvegan.org") {
    throw new Error(`Image publique AgentVegan absente ou invalide pour ${context}.`);
  }
  return image;
}

function normalizeRecipeSteps(value: unknown): JsonObject | null {
  const guide = record(value);
  if (!guide) throw new Error("Le guide de recette requis par Agent Vegan est absent.");
  const candidates = array(guide.steps);
  if (!candidates.length) throw new Error("Le guide de recette requis par Agent Vegan ne contient aucune étape.");
  const steps = candidates.map((candidate, index) => {
    const step = record(candidate);
    if (!step) throw new Error(`L’étape ${index + 1} ne respecte pas le contrat Agent Vegan.`);
    const instruction = stringOrNull(step.beginner_instruction) ?? stringOrNull(step.short_instruction);
    if (!instruction?.trim()) throw new Error(`L’étape ${index + 1} ne contient aucune instruction publique.`);
    return {
      ...step,
      beginner_instruction: instruction,
      image: requiredRecipeImage(step.image, `l’étape ${index + 1}`),
    } as JsonObject;
  });
  return { ...guide, steps } as JsonObject;
}

export function recipeDetailForUi(value: unknown): JsonObject {
  const recipe = record(value);
  if (!recipe || typeof recipe.id !== "string" || typeof recipe.title !== "string") {
    throw new Error("La recette ne respecte pas le contrat requis par l’interface MCP Apps.");
  }
  return {
    ...recipe,
    image_url: requiredRecipeImage(recipe.image_url, `la recette ${recipe.id}`),
    guide: normalizeRecipeSteps(recipe.guide),
  } as JsonObject;
}

export function recipeCardForUi(value: unknown): JsonObject {
  const recipe = record(value);
  if (!recipe || typeof recipe.id !== "string" || typeof recipe.title !== "string" || typeof recipe.slug !== "string") {
    throw new Error("Une carte recette ne respecte pas le contrat requis par l’interface MCP Apps.");
  }
  return {
    id: recipe.id,
    slug: recipe.slug,
    title: recipe.title,
    prep_minutes: numberOrNull(recipe.prep_minutes),
    image_url: requiredRecipeImage(recipe.image_url, `la recette ${recipe.id}`),
    url: stringOrNull(recipe.url),
    step_count: numberOrNull(recipe.step_count),
  };
}

export function recipeGalleryItemForUi(value: unknown): JsonObject {
  return {
    ...recipeCardForUi(value),
    detail: recipeDetailForUi(value),
  };
}

export function productCardForUi(value: unknown): JsonObject {
  const product = record(value);
  if (!product || typeof product.id !== "string" || typeof product.name !== "string") {
    throw new Error("Un produit ne respecte pas le contrat requis par l’interface MCP Apps.");
  }
  const nutrition = record(product.nutrition) as JsonObject | null;
  const displayNutriScore = record(nutrition?.display_nutri_score);
  if (!nutrition || typeof displayNutriScore?.grade !== "string" || !/^[a-e]$/u.test(displayNutriScore.grade)) {
    throw new Error(`Le Nutri-Score public du produit ${product.id} est absent ou invalide.`);
  }
  return {
    id: product.id,
    name: product.name,
    brand: stringOrNull(product.brand),
    category_id: stringOrNull(product.category_id),
    gtin: stringOrNull(product.gtin),
    image_url: absoluteAgentVeganImage(product.image_url),
    last_seen_at: stringOrNull(product.last_seen_at),
    nutrition,
    offers: array(product.offers) as JsonValue[],
  };
}

function nutrientRows(value: unknown): JsonObject[] {
  if (Array.isArray(value)) {
    return value.flatMap((candidate) => {
      const nutrient = record(candidate);
      if (!nutrient || typeof nutrient.id !== "string") return [];
      const min = numberOrNull(nutrient.min);
      const max = numberOrNull(nutrient.max);
      if (min === null || max === null) return [];
      return [{
        id: nutrient.id,
        label: typeof nutrient.label === "string" && nutrient.label ? nutrient.label : nutrient.id.replaceAll("_", " "),
        unit: stringOrNull(nutrient.unit) ?? "",
        min,
        max,
        status: stringOrNull(nutrient.status),
        method: stringOrNull(nutrient.method),
      }];
    });
  }
  const nutrients = record(value);
  if (!nutrients) return [];
  return Object.entries(nutrients).flatMap(([id, candidate]) => {
    const nutrient = record(candidate);
    if (!nutrient) return [];
    const min = numberOrNull(nutrient.min);
    const max = numberOrNull(nutrient.max);
    if (min === null || max === null) return [];
    return [{
      id,
      label: id.replaceAll("_", " "),
      unit: stringOrNull(nutrient.unit) ?? "",
      min,
      max,
      status: stringOrNull(nutrient.status),
      method: stringOrNull(nutrient.method),
    }];
  });
}

export function nutritionComparisonForUi(value: unknown): JsonObject {
  const comparison = record(value);
  const basis = stringOrNull(comparison?.basis);
  const comparisons = array(comparison?.comparisons);
  if (!basis || comparisons.length < 2) {
    throw new Error("La comparaison nutritionnelle ne respecte pas le contrat requis par l’interface MCP Apps.");
  }
  const series = comparisons.map((candidate) => {
    const item = record(candidate);
    if (!item || typeof item.id !== "string" || typeof item.name !== "string") {
      throw new Error("Une série nutritionnelle est invalide.");
    }
    return {
      entity_type: item.entity_type === "recipe" ? "recipe" : "ingredient",
      id: item.id,
      name: item.name,
      basis,
      nutrients: nutrientRows(item.nutrients),
    } as JsonObject;
  });
  return { view: "nutrition_comparison", basis, series };
}

export function viewEnvelope(response: PublicResponse, data: JsonValue, nextCursor = response.next_cursor): Record<string, unknown> {
  return {
    dataset_version: response.dataset_version,
    data,
    next_cursor: nextCursor,
    sources: response.sources,
    coverage_warnings: response.coverage_warnings,
    checked_at: response.checked_at,
  };
}

function appResource(uri: string): ReadResourceResult {
  if (!MCP_APP_HTML) throw new Error("Le bundle MCP Apps n’a pas été généré. Exécutez npm run build:ui.");
  return {
    contents: [{
      uri,
      mimeType: RESOURCE_MIME_TYPE,
      text: MCP_APP_HTML,
      _meta: {
        ui: {
          prefersBorder: true,
          domain: "https://mcp.agentvegan.org",
          csp: {
            connectDomains: [],
            resourceDomains: [...MCP_APP_IMAGE_ORIGINS],
            frameDomains: [],
          },
        },
        "openai/widgetDescription": "Explorer les recettes, substituts, ingrédients, produits et nutriments Agent Vegan dans une interface interactive.",
        "openai/widgetPrefersBorder": true,
        "openai/widgetDomain": "https://mcp.agentvegan.org",
        "openai/widgetCSP": {
          connect_domains: [],
          resource_domains: [...MCP_APP_IMAGE_ORIGINS],
        },
      },
    }],
  };
}

export function registerAgentVeganMcpAppResources(server: McpServer): void {
  for (const resource of UI_RESOURCES) {
    server.registerResource(resource.title, resource.uri, {
      title: resource.title,
      description: resource.description,
      mimeType: RESOURCE_MIME_TYPE,
      cacheHint: { ttlMs: 86_400_000, cacheScope: "public" },
    }, () => Promise.resolve(appResource(resource.uri)));
  }
}

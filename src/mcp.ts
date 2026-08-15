import { McpServer, ResourceTemplate, type CallToolResult, type ReadResourceResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import { errorPayload } from "./errors.js";
import { PublicDataService } from "./service.js";
import type { PublicEntity } from "./contracts.js";

const annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

const pagination = {
  limit: z.number().int().min(1).max(50).optional().describe("Nombre maximal de résultats (1 à 50, 20 par défaut)."),
  cursor: z.string().optional().describe("Curseur opaque renvoyé par l’appel précédent."),
};

async function call(operation: () => Promise<Record<string, unknown>>): Promise<CallToolResult> {
  try {
    const result = await operation();
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: result,
    };
  } catch (error) {
    const payload = errorPayload(error);
    return {
      isError: true,
      content: [{ type: "text", text: JSON.stringify(payload.body) }],
      structuredContent: payload.body,
    };
  }
}

async function resource(uri: URL, operation: () => Promise<Record<string, unknown>>): Promise<ReadResourceResult> {
  try {
    const result = await operation();
    return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(result) }] };
  } catch (error) {
    const payload = errorPayload(error);
    return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(payload.body) }] };
  }
}

export function createAgentVeganMcp(service: PublicDataService): McpServer {
  const server = new McpServer({
    name: "AgentVegan Public Data",
    version: "1.0.0",
    title: "AgentVegan",
    description: "Recettes véganes françaises, ingrédients, nutrition sourcée, substitutions, enseignes et produits végétaux publics.",
    websiteUrl: "https://mcp.agentvegan.org/",
    icons: [{ src: "https://mcp.agentvegan.org/logo.svg", mimeType: "image/svg+xml" }],
  });

  server.registerTool("search_recipes", {
    title: "Rechercher des recettes véganes",
    description: "Recherche les recettes publiques AgentVegan par texte, ingrédients, repas, temps maximal et seuil nutritionnel par portion. Utiliser les identifiants de nutriments du catalogue, par exemple iron_mg.",
    annotations,
    inputSchema: z.object({
      query: z.string().min(1).optional().describe("Texte libre, par exemple crêpes ou curry."),
      ingredients: z.array(z.string().min(1)).max(10).optional().describe("Tous les ingrédients demandés doivent être présents."),
      meal: z.string().min(1).optional().describe("Type de repas."),
      max_time_minutes: z.number().nonnegative().optional(),
      nutrient: z.string().min(1).optional().describe("Identifiant stable du nutriment."),
      nutrient_minimum: z.number().nonnegative().optional().describe("Minimum par portion, dans l’unité déclarée par le nutriment."),
      ...pagination,
    }),
  }, (input) => call(() => service.searchRecipes(input) as Promise<Record<string, unknown>>));

  server.registerTool("get_recipe", {
    title: "Consulter une recette",
    description: "Retourne une recette complète : étapes, ingrédients, nutrition, bases de calcul, bornes et sources.",
    annotations,
    inputSchema: z.object({ id: z.string().min(1).describe("Identifiant stable ou slug de recette.") }),
  }, ({ id }) => call(() => service.getRecipe(id) as Promise<Record<string, unknown>>));

  server.registerTool("search_ingredients", {
    title: "Rechercher des ingrédients",
    description: "Recherche le référentiel canonique d’ingrédients et ses synonymes, avec statuts de substitution et couverture nutritionnelle.",
    annotations,
    inputSchema: z.object({ query: z.string().min(1).optional(), ...pagination }),
  }, (input) => call(() => service.searchIngredients(input) as Promise<Record<string, unknown>>));

  server.registerTool("get_ingredient", {
    title: "Consulter un ingrédient",
    description: "Retourne une fiche d’ingrédient avec synonymes, usages, recettes, composition pour 100 g, méthode et provenance.",
    annotations,
    inputSchema: z.object({ id: z.string().min(1).describe("Identifiant stable ou nom non ambigu.") }),
  }, ({ id }) => call(() => service.getIngredient(id) as Promise<Record<string, unknown>>));

  server.registerTool("find_stores_for_ingredient", {
    title: "Trouver où acheter un ingrédient",
    description: "Retourne les enseignes et preuves datées de référencement ou d’absence pour un ingrédient. Une preuve ne garantit jamais le stock actuel.",
    annotations,
    inputSchema: z.object({
      ingredient: z.string().min(1).describe("Identifiant stable ou nom non ambigu, par exemple tahini."),
      retailer: z.string().min(1).optional().describe("Identifiant d’enseigne."),
      status: z.enum(["listed", "not_found", "unavailable", "unknown", "not_applicable"]).optional(),
      ...pagination,
    }),
  }, (input) => call(() => service.findStoresForIngredient(input) as Promise<Record<string, unknown>>));

  server.registerTool("find_substitutes", {
    title: "Trouver un substitut culinaire",
    description: "Retourne uniquement les substitutions culinaires validées, avec conversion de quantité, justification et contexte de recette. Les produits commerciaux restent séparés.",
    annotations,
    inputSchema: z.object({
      ingredient: z.string().min(1),
      recipe_id: z.string().min(1).optional().describe("Restreint aux adaptations propres à cette recette."),
      ...pagination,
    }),
  }, (input) => call(() => service.findSubstitutes(input) as Promise<Record<string, unknown>>));

  server.registerTool("search_plant_products", {
    title: "Rechercher des produits végétaux",
    description: "Recherche les produits végétaux commerciaux et leurs offres datées, sans les présenter comme des substitutions culinaires universelles.",
    annotations,
    inputSchema: z.object({
      query: z.string().min(1).optional(),
      brand: z.string().min(1).optional(),
      category: z.string().min(1).optional(),
      retailer: z.string().min(1).optional(),
      in_stock_only: z.boolean().optional(),
      ...pagination,
    }),
  }, (input) => call(() => service.searchPlantProducts(input) as Promise<Record<string, unknown>>));

  server.registerTool("compare_nutrition", {
    title: "Comparer la nutrition",
    description: "Compare 2 à 10 ingrédients ou recettes sur une base explicite. 100_g est réservé aux ingrédients sourcés ; portion et recette aux recettes chiffrées.",
    annotations,
    inputSchema: z.object({
      entities: z.array(z.string().min(1)).min(2).max(10),
      basis: z.enum(["100_g", "portion", "recette"]),
    }),
  }, (input) => call(() => service.compareNutrition(input) as Promise<Record<string, unknown>>));

  server.registerTool("get_catalog_status", {
    title: "Vérifier l’état du catalogue",
    description: "Retourne version, compteurs, couverture, âge, sources, licences, avertissements et limitations connues.",
    annotations,
    inputSchema: z.object({}),
  }, () => call(() => service.getCatalogStatus() as Promise<Record<string, unknown>>));

  server.registerResource("catalog-manifest", "agentvegan://catalog/manifest", {
    title: "Manifeste du catalogue public AgentVegan",
    description: "Version, empreintes, compteurs, couverture, sources et avertissements.",
    mimeType: "application/json",
    cacheHint: { ttlMs: 300_000, cacheScope: "public" },
  }, (uri) => resource(uri, () => service.getCatalogStatus() as Promise<Record<string, unknown>>));

  server.registerResource("recipe", new ResourceTemplate("agentvegan://recipes/{id}", { list: undefined }), {
    title: "Fiche recette AgentVegan",
    description: "Fiche individuelle d’une recette par identifiant stable ou slug.",
    mimeType: "application/json",
    cacheHint: { ttlMs: 3_600_000, cacheScope: "public" },
  }, (uri, variables) => resource(uri, () => service.getRecipe(String(variables.id)) as Promise<Record<string, unknown>>));

  server.registerResource("ingredient", new ResourceTemplate("agentvegan://ingredients/{id}", { list: undefined }), {
    title: "Fiche ingrédient AgentVegan",
    description: "Fiche individuelle d’un ingrédient canonique.",
    mimeType: "application/json",
    cacheHint: { ttlMs: 3_600_000, cacheScope: "public" },
  }, (uri, variables) => resource(uri, () => service.getIngredient(String(variables.id)) as Promise<Record<string, unknown>>));

  server.registerResource("entity-record", new ResourceTemplate("agentvegan://entities/{entity}/{id}", { list: undefined }), {
    title: "Fiche d’une entité AgentVegan",
    description: "Accès direct aux huit entités publiques : recipe, ingredient, nutrient, retailer, availability-evidence, substitution-rule, plant-product et source-reference.",
    mimeType: "application/json",
    cacheHint: { ttlMs: 3_600_000, cacheScope: "public" },
  }, (uri, variables) => resource(uri, () => service.getEntityRecord(String(variables.entity) as PublicEntity, String(variables.id)) as Promise<Record<string, unknown>>));

  return server;
}

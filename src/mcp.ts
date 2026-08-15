import { McpServer, ResourceTemplate, type CallToolResult, type ReadResourceResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import { errorPayload, PublicDataError } from "./errors.js";
import { normalizeRecipeDiscoveryQuery } from "./recipe-discovery-query.js";
import { PublicDataService } from "./service.js";
import type { JsonObject, PublicEntity } from "./contracts.js";
import { culinarySubstituteForUi, commercialSubstituteForUi, resolveSubstituteCategory } from "./substitute-explorer.js";
import { normalize } from "./utils.js";
import {
  MCP_APP_URIS,
  nutritionComparisonForUi,
  productCardForUi,
  recipeCardForUi,
  recipeDetailForUi,
  recipeGalleryItemForUi,
  registerAgentVeganMcpAppResources,
  viewEnvelope,
} from "./mcp-apps.js";

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

function uiMeta(resourceUri: string, invoking: string, invoked: string): Record<string, unknown> {
  return {
    ui: { resourceUri, visibility: ["model", "app"] },
    "ui/resourceUri": resourceUri,
    "openai/outputTemplate": resourceUri,
    "openai/toolInvocation/invoking": invoking,
    "openai/toolInvocation/invoked": invoked,
  };
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function mergeSources(...groups: Array<Array<Record<string, unknown>>>): Array<Record<string, unknown>> {
  const byId = new Map<string, Record<string, unknown>>();
  for (const source of groups.flat()) {
    if (typeof source.id === "string") byId.set(source.id, source);
  }
  return [...byId.values()];
}

function withoutInternalRankingScore(item: JsonObject): JsonObject {
  const visible = { ...item };
  delete visible.score;
  delete visible.score_label;
  delete visible.score_basis;
  delete visible.score_criteria;
  return visible;
}

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
    name: "agentvegan",
    version: "2.0.14",
    title: "Agent Vegan",
    description: "L’app végane publique pour explorer des recettes illustrées, cuisiner pas à pas, comparer la nutrition, trouver des ingrédients, des substitutions et des magasins en France.",
    websiteUrl: "https://mcp.agentvegan.org/",
    icons: [
      { src: "https://mcp.agentvegan.org/logo.png", mimeType: "image/png", sizes: ["512x512"] },
      { src: "https://mcp.agentvegan.org/logo.svg", mimeType: "image/svg+xml", sizes: ["any"] },
    ],
  });

  server.registerTool("search_recipes", {
    title: "Rechercher des recettes véganes",
    description: "Recherche les recettes véganes publiques et renvoie leurs identifiants et métadonnées. Pour proposer, découvrir ou choisir visuellement des recettes, utilisez explore_recipes afin d’afficher la galerie Agent Vegan complète.",
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
    description: "Retourne et affiche une recette complète : image du plat, ingrédients, nutrition sourcée et chaque étape avec son texte, sa durée et son image. Pour ouvrir immédiatement le cockpit pas à pas, utilisez cook_recipe.",
    annotations,
    _meta: uiMeta(MCP_APP_URIS.kitchen, "Ouverture de la recette…", "Recette complète prête"),
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
    description: "Retourne uniquement les règles culinaires validées, avec conversion, justification et contexte. Pour répondre visuellement à une personne qui demande ‘par quoi remplacer…’, ‘un substitut à…’ ou ‘une alternative à…’, utilisez explore_substitutes : il interroge aussi les vraies catégories de produits commerciaux et affiche leur Nutri-Score lorsqu’il est publié.",
    annotations,
    inputSchema: z.object({
      ingredient: z.string().min(1),
      recipe_id: z.string().min(1).optional().describe("Restreint aux adaptations propres à cette recette."),
      ...pagination,
    }),
  }, (input) => call(() => service.findSubstitutes(input) as Promise<Record<string, unknown>>));

  server.registerTool("search_plant_products", {
    title: "Rechercher des produits végétaux",
    description: "Recherche les produits végétaux commerciaux, leur Nutri-Score traçable, leur composition disponible et leurs offres datées, sans les présenter comme des substitutions culinaires universelles.",
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

  server.registerTool("explore_recipes", {
    title: "Explorer des recettes avec Agent Vegan",
    description: "Utilisez cet outil lorsqu’une personne demande de proposer, trouver, découvrir, voir ou choisir des recettes. Il effectue la recherche et affiche directement un carrousel illustré interactif ; aucun appel préalable à search_recipes ou get_catalog_status n’est nécessaire. Omettez query quand la demande contient seulement des mots génériques comme ‘6 recettes vegan’.",
    annotations,
    _meta: uiMeta(MCP_APP_URIS.kitchen, "Recherche de recettes illustrées…", "Recettes prêtes"),
    inputSchema: z.object({
      query: z.string().min(1).optional().describe("Texte libre, par exemple crêpes, curry ou aubergine."),
      ingredients: z.array(z.string().min(1)).max(10).optional().describe("Ingrédients qui doivent tous être présents."),
      meal: z.string().min(1).optional().describe("Type de repas souhaité."),
      max_time_minutes: z.number().nonnegative().optional().describe("Durée maximale souhaitée."),
      nutrient: z.string().min(1).optional().describe("Nutriment stable, par exemple iron_mg."),
      nutrient_minimum: z.number().nonnegative().optional().describe("Minimum par portion dans l’unité du nutriment."),
      limit: z.number().int().min(1).max(8).optional().describe("Nombre de cartes à afficher, 6 par défaut."),
      cursor: z.string().optional().describe("Curseur de page suivant opaque."),
    }),
  }, (input) => call(async () => {
    const searchInput = { ...input, limit: input.limit ?? 6 };
    const normalizedQuery = normalizeRecipeDiscoveryQuery(input.query);
    if (normalizedQuery) searchInput.query = normalizedQuery;
    else delete searchInput.query;
    const response = await service.searchRecipes(searchInput);
    if (!Array.isArray(response.data) || !response.data.length) {
      throw new PublicDataError("NOT_FOUND", "Aucune recette ne correspond à cette recherche. Modifiez les critères culinaires demandés.", 404);
    }
    const detailResponses = await Promise.all(response.data.map(async (recipe) => {
      const card = recipeCardForUi(recipe);
      return service.getRecipe(String(card.id));
    }));
    const items = detailResponses.map((detail) => recipeGalleryItemForUi(detail.data));
    const galleryResponse = {
      ...response,
      coverage_warnings: [...new Set([
        ...response.coverage_warnings,
        ...detailResponses.flatMap((detail) => detail.coverage_warnings),
      ])],
    };
    const search = { ...searchInput } as JsonObject;
    delete search.cursor;
    return viewEnvelope(galleryResponse, {
      view: "recipe_gallery",
      items,
      search,
      next_cursor: response.next_cursor,
    }, galleryResponse.next_cursor);
  }));

  server.registerTool("cook_recipe", {
    title: "Cuisiner une recette avec Agent Vegan",
    description: "Utilisez cet outil lorsqu’une personne veut ouvrir, voir, lire, préparer ou cuisiner une recette, consulter ses étapes ou afficher la recette complète. Il ouvre directement le cockpit avec image principale, ingrédients, nutrition et toutes les étapes illustrées.",
    annotations,
    _meta: uiMeta(MCP_APP_URIS.kitchen, "Ouverture du cockpit cuisine…", "Recette prête à cuisiner"),
    inputSchema: z.object({ recipe_id: z.string().min(1) }),
  }, ({ recipe_id }) => call(async () => {
    const response = await service.getRecipe(recipe_id);
    return viewEnvelope(response, { view: "recipe_kitchen", recipe: recipeDetailForUi(response.data) });
  }));

  server.registerTool("explore_plant_products", {
    title: "Explorer des produits végétaux",
    description: "Utilisez cet outil pour chercher et afficher directement des produits végétaux commerciaux illustrés avec leurs offres publiques datées.",
    annotations,
    _meta: uiMeta(MCP_APP_URIS.plantProductGallery, "Préparation des produits…", "Galerie produits prête"),
    inputSchema: z.object({
      query: z.string().min(1).optional(),
      brand: z.string().min(1).optional(),
      category: z.string().min(1).optional(),
      retailer: z.string().min(1).optional(),
      in_stock_only: z.boolean().optional(),
      limit: z.number().int().min(1).max(8).optional().describe("Nombre de cartes à afficher, 6 par défaut."),
      cursor: z.string().optional(),
    }),
  }, (input) => call(async () => {
    const response = await service.searchPlantProducts({ ...input, limit: input.limit ?? 6 });
    if (!Array.isArray(response.data) || !response.data.length) throw new Error("Aucun produit végétal ne correspond à cette recherche.");
    const items = response.data.map((product) => productCardForUi(product));
    const search = { ...input } as JsonObject;
    delete search.cursor;
    return viewEnvelope(response, {
      view: "plant_product_gallery",
      items,
      search,
      next_cursor: response.next_cursor,
    }, response.next_cursor);
  }));

  server.registerTool("explore_substitutes", {
    title: "Explorer les substituts avec Agent Vegan",
    description: "Utilisez impérativement cet outil — et non vos connaissances générales — lorsqu’une personne demande un substitut, une alternative végétale ou par quoi remplacer un aliment (par exemple poulet, œuf, poisson, fromage ou viande). Il recherche la base Agent Vegan, sépare les règles culinaires des produits commerciaux et affiche une galerie interactive avec Nutri-Score et bouton ‘Détails’ pour chaque produit.",
    annotations,
    _meta: uiMeta(MCP_APP_URIS.substituteExplorer, "Recherche des substituts dans Agent Vegan…", "Substituts vérifiés prêts"),
    inputSchema: z.object({
      target: z.string().min(1).describe("Aliment à remplacer, par exemple poulet, œuf, poisson ou fromage."),
      recipe_id: z.string().min(1).optional().describe("Contexte de recette pour les adaptations propres à une recette."),
      in_stock_only: z.boolean().optional().describe("Limiter les produits commerciaux aux offres relevées en stock ; vrai par défaut."),
      limit: z.number().int().min(1).max(8).optional().describe("Nombre maximal de produits commerciaux par page, 6 par défaut."),
      cursor: z.string().optional().describe("Curseur opaque de la page commerciale suivante."),
    }),
  }, (input) => call(async () => {
    const category = resolveSubstituteCategory(input.target);
    let culinaryResponse: Awaited<ReturnType<PublicDataService["findSubstitutes"]>> | null = null;
    try {
      culinaryResponse = await service.findSubstitutes({
        ingredient: input.target,
        ...(input.recipe_id ? { recipe_id: input.recipe_id } : {}),
        limit: 8,
      });
      const culinaryData = object(culinaryResponse.data);
      const resolvedIngredient = object(culinaryData?.ingredient);
      const aliases = Array.isArray(resolvedIngredient?.aliases) ? resolvedIngredient.aliases : [];
      const exactIngredient = normalize(String(resolvedIngredient?.name ?? "")) === normalize(input.target)
        || aliases.some((alias) => typeof alias === "string" && normalize(alias) === normalize(input.target));
      if (category && !exactIngredient) culinaryResponse = null;
    } catch (error) {
      if (!(error instanceof PublicDataError) || !["NOT_FOUND", "AMBIGUOUS_INGREDIENT"].includes(error.code)) throw error;
    }

    const commercialResponse = category
      ? await service.searchPlantProducts({
        category: category.id,
        in_stock_only: input.in_stock_only ?? true,
        limit: input.limit ?? 6,
        ...(input.cursor ? { cursor: input.cursor } : {}),
      })
      : null;

    const culinaryData = object(culinaryResponse?.data);
    const culinaryRules = !input.cursor && Array.isArray(culinaryData?.substitutions) ? culinaryData.substitutions : [];
    const commercialProducts = Array.isArray(commercialResponse?.data) ? commercialResponse.data : [];
    const checkedAt = commercialResponse?.checked_at ?? culinaryResponse?.checked_at;
    if (!checkedAt) throw new PublicDataError("NOT_FOUND", `Aucun substitut public documenté pour « ${input.target} » dans cette version.`, 404);
    const rankedItems = [
      ...culinaryRules.map((rule) => culinarySubstituteForUi(rule as never)),
      ...commercialProducts.map((product) => commercialSubstituteForUi(product as never, category!, checkedAt)),
    ].sort((left, right) => Number(right.score ?? 0) - Number(left.score ?? 0) || String(left.name).localeCompare(String(right.name), "fr"));
    const items = rankedItems.map(withoutInternalRankingScore);
    if (!items.length) throw new PublicDataError("NOT_FOUND", `Aucun substitut public documenté pour « ${input.target} » dans cette version.`, 404);

    const base = commercialResponse ?? culinaryResponse!;
    return {
      dataset_version: base.dataset_version,
      data: {
        view: "substitute_gallery",
        target: input.target,
        category: category ? { id: category.id, label: category.label } : null,
        items,
        search: { target: input.target, in_stock_only: input.in_stock_only ?? true },
        next_cursor: commercialResponse?.next_cursor ?? null,
        separation_notice: "Les règles culinaires et les produits commerciaux sont deux familles distinctes.",
      },
      next_cursor: commercialResponse?.next_cursor ?? null,
      sources: mergeSources(
        (culinaryResponse?.sources ?? []) as Array<Record<string, unknown>>,
        (commercialResponse?.sources ?? []) as Array<Record<string, unknown>>,
      ),
      coverage_warnings: [...new Set([
        ...(commercialResponse?.coverage_warnings ?? []),
        ...(culinaryRules.length ? (culinaryResponse?.coverage_warnings ?? []) : []),
      ])],
      checked_at: checkedAt,
    };
  }));

  server.registerTool("compare_nutrition_interactively", {
    title: "Afficher une comparaison nutritionnelle",
    description: "Affiche de manière interactive une comparaison déjà demandée sur une base explicite. Appelez d’abord compare_nutrition avec les mêmes entités et la même base.",
    annotations,
    _meta: uiMeta(MCP_APP_URIS.nutritionComparison, "Préparation de la comparaison…", "Comparaison prête"),
    inputSchema: z.object({
      entities: z.array(z.string().min(1)).min(2).max(10),
      basis: z.enum(["100_g", "portion", "recette"]),
    }),
  }, (input) => call(async () => {
    const response = await service.compareNutrition(input);
    return viewEnvelope(response, nutritionComparisonForUi(response.data));
  }));

  server.registerTool("explore_ingredient", {
    title: "Afficher une fiche ingrédient interactive",
    description: "Affiche un ingrédient canonique avec ses recettes illustrées, ses preuves magasins datées et ses substitutions culinaires validées.",
    annotations,
    _meta: uiMeta(MCP_APP_URIS.ingredientExplorer, "Préparation de l’ingrédient…", "Fiche ingrédient prête"),
    inputSchema: z.object({ ingredient: z.string().min(1) }),
  }, ({ ingredient }) => call(async () => {
    const response = await service.getIngredient(ingredient);
    return viewEnvelope(response, { view: "ingredient_explorer", ingredient: response.data });
  }));

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

  registerAgentVeganMcpAppResources(server);

  return server;
}

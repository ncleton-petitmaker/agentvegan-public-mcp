export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "AgentVegan Public Data API",
    version: "1.0.0",
    description: "API publique en lecture seule des recettes, ingrédients, nutriments, substitutions, enseignes et produits végétaux AgentVegan.",
    license: { name: "Licences par source", url: "https://mcp.agentvegan.org/terms" },
  },
  servers: [{ url: "https://mcp.agentvegan.org/api/v1" }],
  paths: {
    "/recipes": { get: { operationId: "searchRecipes", summary: "Rechercher des recettes", parameters: [
      { name: "q", in: "query", schema: { type: "string" } },
      { name: "ingredients", in: "query", description: "Liste séparée par des virgules", schema: { type: "string" } },
      { name: "meal", in: "query", schema: { type: "string" } },
      { name: "max_time_minutes", in: "query", schema: { type: "number", minimum: 0 } },
      { name: "nutrient", in: "query", schema: { type: "string" } },
      { name: "nutrient_minimum", in: "query", schema: { type: "number", minimum: 0 } },
      { $ref: "#/components/parameters/limit" }, { $ref: "#/components/parameters/cursor" },
    ], responses: { "200": { $ref: "#/components/responses/PublicResponse" }, "400": { $ref: "#/components/responses/Error" }, "503": { $ref: "#/components/responses/Error" } } } },
    "/recipes/{id}": { get: { operationId: "getRecipe", summary: "Consulter une recette", parameters: [{ $ref: "#/components/parameters/id" }], responses: { "200": { $ref: "#/components/responses/PublicResponse" }, "404": { $ref: "#/components/responses/Error" } } } },
    "/ingredients": { get: { operationId: "searchIngredients", summary: "Rechercher des ingrédients", parameters: [{ name: "q", in: "query", schema: { type: "string" } }, { $ref: "#/components/parameters/limit" }, { $ref: "#/components/parameters/cursor" }], responses: { "200": { $ref: "#/components/responses/PublicResponse" } } } },
    "/ingredients/{id}": { get: { operationId: "getIngredient", summary: "Consulter un ingrédient", parameters: [{ $ref: "#/components/parameters/id" }], responses: { "200": { $ref: "#/components/responses/PublicResponse" }, "404": { $ref: "#/components/responses/Error" }, "409": { $ref: "#/components/responses/Error" } } } },
    "/ingredients/{id}/stores": { get: { operationId: "findStoresForIngredient", summary: "Trouver des enseignes", parameters: [{ $ref: "#/components/parameters/id" }, { name: "retailer", in: "query", schema: { type: "string" } }, { name: "status", in: "query", schema: { type: "string" } }, { $ref: "#/components/parameters/limit" }, { $ref: "#/components/parameters/cursor" }], responses: { "200": { $ref: "#/components/responses/PublicResponse" } } } },
    "/ingredients/{id}/substitutes": { get: { operationId: "findSubstitutes", summary: "Trouver des substitutions culinaires", parameters: [{ $ref: "#/components/parameters/id" }, { name: "recipe_id", in: "query", schema: { type: "string" } }, { $ref: "#/components/parameters/limit" }, { $ref: "#/components/parameters/cursor" }], responses: { "200": { $ref: "#/components/responses/PublicResponse" } } } },
    "/products": { get: { operationId: "searchPlantProducts", summary: "Rechercher des produits végétaux", parameters: [{ name: "q", in: "query", schema: { type: "string" } }, { name: "brand", in: "query", schema: { type: "string" } }, { name: "category", in: "query", schema: { type: "string" } }, { name: "retailer", in: "query", schema: { type: "string" } }, { name: "in_stock_only", in: "query", schema: { type: "boolean" } }, { $ref: "#/components/parameters/limit" }, { $ref: "#/components/parameters/cursor" }], responses: { "200": { $ref: "#/components/responses/PublicResponse" } } } },
    "/nutrition/compare": { get: { operationId: "compareNutrition", summary: "Comparer la nutrition", parameters: [{ name: "entities", in: "query", required: true, description: "2 à 10 valeurs séparées par des virgules", schema: { type: "string" } }, { name: "basis", in: "query", required: true, schema: { type: "string", enum: ["100_g", "portion", "recette"] } }], responses: { "200": { $ref: "#/components/responses/PublicResponse" }, "400": { $ref: "#/components/responses/Error" } } } },
    "/status": { get: { operationId: "getCatalogStatus", summary: "État du catalogue", responses: { "200": { $ref: "#/components/responses/PublicResponse" } } } },
  },
  components: {
    parameters: {
      id: { name: "id", in: "path", required: true, schema: { type: "string" } },
      limit: { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50, default: 20 } },
      cursor: { name: "cursor", in: "query", schema: { type: "string" } },
    },
    responses: {
      PublicResponse: { description: "Réponse versionnée", content: { "application/json": { schema: { $ref: "#/components/schemas/PublicResponse" } } } },
      Error: { description: "Erreur explicite", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
    },
    schemas: {
      PublicResponse: { type: "object", required: ["dataset_version", "data", "next_cursor", "sources", "coverage_warnings", "checked_at"], properties: {
        dataset_version: { type: "string" }, data: {}, next_cursor: { type: ["string", "null"] }, sources: { type: "array", items: { type: "object" } }, coverage_warnings: { type: "array", items: { type: "string" } }, checked_at: { type: "string", format: "date-time" },
      } },
      Error: { type: "object", required: ["error", "message"], properties: { error: { type: "string" }, message: { type: "string" }, details: { type: "object" } } },
    },
  },
} as const;

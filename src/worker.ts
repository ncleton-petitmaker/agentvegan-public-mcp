import { createMcpHandler } from "agents/mcp/server";
import { Hono } from "hono";
import { createAgentVeganMcp } from "./mcp.js";
import { openApiDocument } from "./openapi.js";
import { D1CatalogRepository } from "./repository-d1.js";
import { errorPayload, PublicDataError } from "./errors.js";
import { PublicDataService } from "./service.js";
import { rateLimitKey } from "./rate-limit-key.js";
import serverRegistry from "../server.json" with { type: "json" };

export interface Env {
  PUBLIC_DATA: D1Database;
  PUBLIC_RATE_LIMITER?: RateLimit;
  EXPORTS: Fetcher;
  OPENAI_APPS_CHALLENGE?: string;
}

function numberParameter(value: string | undefined): number | undefined {
  if (value === undefined || value === "") return undefined;
  const result = Number(value);
  if (!Number.isFinite(result)) throw new PublicDataError("INVALID_ARGUMENT", `Valeur numérique invalide : ${value}.`, 400);
  return result;
}

function booleanParameter(value: string | undefined): boolean | undefined {
  if (value === undefined || value === "") return undefined;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  throw new PublicDataError("INVALID_ARGUMENT", `Valeur booléenne invalide : ${value}.`, 400);
}

function service(env: Env): PublicDataService {
  if (!env.PUBLIC_DATA) throw new PublicDataError("DATASET_UNAVAILABLE", "La liaison D1 PUBLIC_DATA est absente.", 503);
  return new PublicDataService(new D1CatalogRepository(env.PUBLIC_DATA));
}

function routeLabel(pathname: string): string {
  if (pathname === "/mcp") return "/mcp";
  if (pathname.startsWith("/exports/")) return "/exports/*";
  return pathname
    .replace(/^\/api\/v1\/recipes\/[^/]+$/u, "/api/v1/recipes/:id")
    .replace(/^\/api\/v1\/ingredients\/[^/]+\/stores$/u, "/api/v1/ingredients/:id/stores")
    .replace(/^\/api\/v1\/ingredients\/[^/]+\/substitutes$/u, "/api/v1/ingredients/:id/substitutes")
    .replace(/^\/api\/v1\/ingredients\/[^/]+$/u, "/api/v1/ingredients/:id");
}

async function rateLimit(request: Request, env: Env): Promise<void> {
  if (!env.PUBLIC_RATE_LIMITER) {
    throw new PublicDataError("DATASET_UNAVAILABLE", "La limitation anti-abus PUBLIC_RATE_LIMITER est absente de l’environnement.", 503);
  }
  const outcome = await env.PUBLIC_RATE_LIMITER.limit({ key: rateLimitKey(request) });
  if (!outcome.success) {
    throw new PublicDataError("RATE_LIMITED", "Trop de requêtes. Réessayez dans une minute.", 429);
  }
}

const documentation = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AgentVegan — données publiques</title><style>body{font:17px/1.55 system-ui,sans-serif;max-width:850px;margin:0 auto;padding:48px 24px;color:#17351f;background:#fbfff9}h1,h2{line-height:1.15}code{background:#eaf5e8;padding:.15rem .35rem;border-radius:.3rem}a{color:#176b36}.card{border:1px solid #cfe4cf;border-radius:14px;padding:20px;margin:20px 0}</style></head><body><h1>AgentVegan Public Data</h1><p>Un accès gratuit, public et sans compte aux recettes véganes, ingrédients canoniques, données nutritionnelles sourcées, substitutions culinaires, enseignes et produits végétaux.</p><p>Les clients compatibles MCP Apps affichent aussi des galeries d’images, fiches recettes illustrées et comparaisons interactives. Les réponses texte et structurées restent disponibles partout.</p><div class="card"><h2>ChatGPT</h2><p>L’app publique AgentVegan sera installable depuis le répertoire OpenAI après approbation. La compatibilité ChatGPT Free ne sera annoncée qu’après un test réel en France.</p></div><div class="card"><h2>Claude</h2><p>Ajoutez le connecteur MCP distant <code>https://mcp.agentvegan.org/mcp</code>.</p></div><div class="card"><h2>Développeurs</h2><p><a href="/openapi.json">OpenAPI</a> · <a href="/exports/v1/manifest.json">Exports versionnés</a> · <a href="/server.json">Registre MCP</a></p></div><p><a href="/privacy">Confidentialité</a> · <a href="/terms">Conditions et licences</a> · <a href="/support">Aide</a></p></body></html>`;

const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="18" fill="#151815"/><circle cx="32" cy="32" r="20" fill="#bdff00"/><path d="M32 18c8 5 12 12 12 21a13 13 0 0 1-24 0c0-9 4-16 12-21Z" fill="#f8f8f4"/><path d="M32 21c5 5 7 10 7 17a8 8 0 0 1-14 0c0-7 2-12 7-17Z" fill="#151815"/></svg>`;

export function createApp(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  app.onError((error, c) => {
    const payload = errorPayload(error);
    return c.json(payload.body, payload.status as 400 | 404 | 409 | 429 | 503);
  });

  app.use("*", async (c, next) => {
    const startedAt = Date.now();
    await next();
    const pathname = new URL(c.req.url).pathname;
    console.log(JSON.stringify({ route: routeLabel(pathname), status: c.res.status, latency_ms: Date.now() - startedAt }));
  });

  app.use("/api/*", async (c, next) => {
    c.header("Access-Control-Allow-Origin", "*");
    c.header("Access-Control-Allow-Methods", "GET, OPTIONS");
    c.header("Access-Control-Allow-Headers", "Content-Type");
    if (c.req.method === "OPTIONS") return c.body(null, 204);
    await rateLimit(c.req.raw, c.env);
    await next();
    c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  });

  app.all("/mcp", async (c) => {
    await rateLimit(c.req.raw, c.env);
    const handler = createMcpHandler(() => createAgentVeganMcp(service(c.env)), {
      route: "/mcp",
      corsOptions: { origin: "*", methods: "GET, POST, DELETE, OPTIONS", headers: "Content-Type, Mcp-Session-Id, MCP-Protocol-Version" },
      allowedHostnames: ["mcp.agentvegan.org", "agentvegan-public-mcp.nicolas-cleton.workers.dev", "localhost", "127.0.0.1", "[::1]"],
      allowedOriginHostnames: ["chatgpt.com", "chat.openai.com", "platform.openai.com", "claude.ai", "localhost", "127.0.0.1", "[::1]"],
      legacy: "stateless",
      responseMode: "auto",
    });
    return handler.fetch(c.req.raw);
  });

  app.get("/api/v1/recipes", (c) => service(c.env).searchRecipes({
    ...(c.req.query("q") ? { query: c.req.query("q") } : {}),
    ...(c.req.query("ingredients") ? { ingredients: c.req.query("ingredients")?.split(",").map((item) => item.trim()).filter(Boolean) } : {}),
    ...(c.req.query("meal") ? { meal: c.req.query("meal") } : {}),
    ...(numberParameter(c.req.query("max_time_minutes")) !== undefined ? { max_time_minutes: numberParameter(c.req.query("max_time_minutes")) } : {}),
    ...(c.req.query("nutrient") ? { nutrient: c.req.query("nutrient") } : {}),
    ...(numberParameter(c.req.query("nutrient_minimum")) !== undefined ? { nutrient_minimum: numberParameter(c.req.query("nutrient_minimum")) } : {}),
    ...(numberParameter(c.req.query("limit")) !== undefined ? { limit: numberParameter(c.req.query("limit")) } : {}),
    ...(c.req.query("cursor") ? { cursor: c.req.query("cursor") } : {}),
  }).then((result) => c.json(result)));
  app.get("/api/v1/recipes/:id", (c) => service(c.env).getRecipe(c.req.param("id")).then((result) => c.json(result)));
  app.get("/api/v1/ingredients", (c) => service(c.env).searchIngredients({
    ...(c.req.query("q") ? { query: c.req.query("q") } : {}),
    ...(numberParameter(c.req.query("limit")) !== undefined ? { limit: numberParameter(c.req.query("limit")) } : {}),
    ...(c.req.query("cursor") ? { cursor: c.req.query("cursor") } : {}),
  }).then((result) => c.json(result)));
  app.get("/api/v1/ingredients/:id", (c) => service(c.env).getIngredient(c.req.param("id")).then((result) => c.json(result)));
  app.get("/api/v1/ingredients/:id/stores", (c) => service(c.env).findStoresForIngredient({
    ingredient: c.req.param("id"),
    ...(c.req.query("retailer") ? { retailer: c.req.query("retailer") } : {}),
    ...(c.req.query("status") ? { status: c.req.query("status") } : {}),
    ...(numberParameter(c.req.query("limit")) !== undefined ? { limit: numberParameter(c.req.query("limit")) } : {}),
    ...(c.req.query("cursor") ? { cursor: c.req.query("cursor") } : {}),
  }).then((result) => c.json(result)));
  app.get("/api/v1/ingredients/:id/substitutes", (c) => service(c.env).findSubstitutes({
    ingredient: c.req.param("id"),
    ...(c.req.query("recipe_id") ? { recipe_id: c.req.query("recipe_id") } : {}),
    ...(numberParameter(c.req.query("limit")) !== undefined ? { limit: numberParameter(c.req.query("limit")) } : {}),
    ...(c.req.query("cursor") ? { cursor: c.req.query("cursor") } : {}),
  }).then((result) => c.json(result)));
  app.get("/api/v1/products", (c) => service(c.env).searchPlantProducts({
    ...(c.req.query("q") ? { query: c.req.query("q") } : {}),
    ...(c.req.query("brand") ? { brand: c.req.query("brand") } : {}),
    ...(c.req.query("category") ? { category: c.req.query("category") } : {}),
    ...(c.req.query("retailer") ? { retailer: c.req.query("retailer") } : {}),
    ...(booleanParameter(c.req.query("in_stock_only")) !== undefined ? { in_stock_only: booleanParameter(c.req.query("in_stock_only")) } : {}),
    ...(numberParameter(c.req.query("limit")) !== undefined ? { limit: numberParameter(c.req.query("limit")) } : {}),
    ...(c.req.query("cursor") ? { cursor: c.req.query("cursor") } : {}),
  }).then((result) => c.json(result)));
  app.get("/api/v1/nutrition/compare", (c) => service(c.env).compareNutrition({
    entities: (c.req.query("entities") ?? "").split(",").map((item) => item.trim()).filter(Boolean),
    basis: c.req.query("basis") as "100_g" | "portion" | "recette",
  }).then((result) => c.json(result)));
  app.get("/api/v1/status", (c) => service(c.env).getCatalogStatus().then((result) => c.json(result)));

  app.get("/exports/v1/*", async (c) => {
    await rateLimit(c.req.raw, c.env);
    if (!c.env.EXPORTS) throw new PublicDataError("DATASET_UNAVAILABLE", "La liaison statique EXPORTS est absente.", 503);
    const sourceUrl = new URL(c.req.url);
    sourceUrl.pathname = sourceUrl.pathname.replace(/^\/exports/u, "");
    const response = await c.env.EXPORTS.fetch(new Request(sourceUrl, c.req.raw));
    if (!response.ok) return response;
    const headers = new Headers(response.headers);
    if (sourceUrl.pathname.endsWith(".jsonl.gz")) {
      headers.set("Content-Type", "application/x-ndjson");
      headers.set("Content-Encoding", "gzip");
    } else if (sourceUrl.pathname.endsWith(".json")) headers.set("Content-Type", "application/json; charset=utf-8");
    headers.set("Cache-Control", "public, max-age=3600, immutable");
    return new Response(response.body, { status: response.status, headers });
  });

  app.get("/", (c) => c.html(documentation));
  app.get("/openapi.json", (c) => c.json(openApiDocument));
  app.get("/logo.svg", (c) => c.body(logoSvg, 200, { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" }));
  app.get("/logo.png", async (c) => {
    if (!c.env.EXPORTS) throw new PublicDataError("DATASET_UNAVAILABLE", "La liaison statique EXPORTS est absente pour le logo Agent Vegan.", 503);
    const logoUrl = new URL(c.req.url);
    logoUrl.pathname = "/logo.png";
    const response = await c.env.EXPORTS.fetch(new Request(logoUrl));
    if (!response.ok) throw new PublicDataError("DATASET_UNAVAILABLE", "Le logo PNG public Agent Vegan est absent du déploiement.", 503);
    const headers = new Headers(response.headers);
    headers.set("Content-Type", "image/png");
    headers.set("Cache-Control", "public, max-age=86400");
    return new Response(response.body, { status: 200, headers });
  });
  app.get("/privacy", (c) => c.html("<html lang=\"fr\"><meta charset=\"utf-8\"><title>Confidentialité — AgentVegan</title><h1>Confidentialité</h1><p>Le service est public et sans compte. Il ne conserve ni prompts complets, ni contenu des réponses, ni données personnelles. Les journaux techniques contiennent uniquement route générique, statut, latence, erreurs agrégées, volumes et âge du catalogue. Cloudflare traite les requêtes pour fournir et protéger le service.</p><p>Contact : support@agentvegan.org</p>"));
  app.get("/terms", (c) => c.html("<html lang=\"fr\"><meta charset=\"utf-8\"><title>Conditions — AgentVegan</title><h1>Conditions et licences</h1><p>Le code est publié sous licence MIT. Les données gardent leurs licences par source : Ciqual sous Licence Ouverte / Etalab 2.0, USDA FoodData Central sous CC0. Les recettes, marques, fiches commerciales et images ne reçoivent aucune licence globale ; consultez le manifeste pour chaque provenance. Les disponibilités sont des observations datées, pas des garanties de stock. Les informations nutritionnelles ne remplacent pas un avis médical.</p>"));
  app.get("/support", (c) => c.html("<html lang=\"fr\"><meta charset=\"utf-8\"><title>Aide — AgentVegan</title><h1>Aide AgentVegan Public Data</h1><p>Documentation : <a href=\"/openapi.json\">OpenAPI</a>. État : <a href=\"/api/v1/status\">catalogue</a>. Contact : support@agentvegan.org.</p>"));
  app.get("/.well-known/openai-apps-challenge", (c) => c.env.OPENAI_APPS_CHALLENGE ? c.text(c.env.OPENAI_APPS_CHALLENGE) : c.json({ error: "CHALLENGE_NOT_CONFIGURED", message: "Définir le secret OPENAI_APPS_CHALLENGE fourni par OpenAI avant la soumission." }, 404));
  app.get("/health", async (c) => {
    const status = await service(c.env).getCatalogStatus();
    const state = typeof status.data === "object" && status.data && !Array.isArray(status.data) ? status.data.state : "unavailable";
    return c.json({ ok: state === "healthy", dataset_version: status.dataset_version, checked_at: status.checked_at }, state === "healthy" ? 200 : 503);
  });
  app.get("/server.json", (c) => c.json(serverRegistry));

  return app;
}

export default createApp();

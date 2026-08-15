import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const endpoint = new URL(process.env.AGENTVEGAN_MCP_URL ?? "https://mcp.agentvegan.org/mcp");
if (endpoint.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)) {
  throw new Error("Le smoke test distant refuse un endpoint non HTTPS.");
}

const client = new Client({ name: "agentvegan-remote-smoke", version: "2.0.0" });
const transport = new StreamableHTTPClientTransport(endpoint);
await client.connect(transport);

try {
  const tools = await client.listTools();
  if (tools.tools.length !== 14) throw new Error(`14 outils attendus en production, ${tools.tools.length} reçus.`);
  const appTools = tools.tools.filter((tool) => typeof tool._meta?.ui?.resourceUri === "string");
  if (appTools.length !== 7 || appTools.some((tool) => typeof tool._meta?.["ui/resourceUri"] !== "string" || typeof tool._meta?.["openai/outputTemplate"] !== "string")) {
    throw new Error("Les points d’entrée UI ne déclarent pas correctement leurs ressources MCP Apps et ChatGPT.");
  }

  const status = await client.callTool({ name: "get_catalog_status", arguments: {} });
  if (status.isError || status.structuredContent?.data?.state !== "healthy") throw new Error("Le catalogue distant n’est pas sain.");

  const search = await client.callTool({ name: "search_recipes", arguments: { limit: 3 } });
  const recipes = search.structuredContent?.data;
  if (!Array.isArray(recipes) || recipes.length !== 3 || recipes.some((recipe) => typeof recipe.image_url !== "string")) {
    throw new Error("La recherche distante ne renvoie pas trois cartes recettes illustrées.");
  }
  const gallery = await client.callTool({ name: "explore_recipes", arguments: { limit: 3 } });
  if (gallery.isError || gallery.structuredContent?.data?.view !== "recipe_gallery") throw new Error("Le rendu distant de la galerie a échoué.");

  const firstRecipeId = gallery.structuredContent?.data?.items?.[0]?.id;
  const kitchen = await client.callTool({ name: "cook_recipe", arguments: { recipe_id: firstRecipeId } });
  const recipe = kitchen.structuredContent?.data?.recipe;
  const steps = recipe?.guide?.steps;
  if (kitchen.isError || !Array.isArray(steps) || steps.length !== recipe?.step_count) throw new Error("Le cockpit distant est incomplet.");
  if (steps.some((step) => !step.beginner_instruction || !step.image?.startsWith("https://agentvegan.org/") || !step.image_alt)) {
    throw new Error("Le cockpit distant contient une étape sans texte ou image publique.");
  }

  const ui = await client.readResource({ uri: "ui://agentvegan/kitchen/v2.html" });
  const resource = ui.contents[0];
  if (!resource || resource.mimeType !== "text/html;profile=mcp-app" || !("text" in resource) || !resource.text.includes("AgentVegan interactif")) {
    throw new Error("La ressource UI distante est absente ou invalide.");
  }

  process.stdout.write(`Production vérifiée : 14 outils, AgentVegan Kitchen et ${steps.length} étapes illustrées sur ${endpoint.href}.\n`);
} finally {
  await client.close();
}

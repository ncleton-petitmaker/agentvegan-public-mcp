import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const endpoint = new URL(process.env.AGENTVEGAN_MCP_URL ?? "https://mcp.agentvegan.org/mcp");
if (endpoint.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)) {
  throw new Error("Le smoke test distant refuse un endpoint non HTTPS.");
}

const client = new Client({ name: "agentvegan-remote-smoke", version: "1.1.0" });
const transport = new StreamableHTTPClientTransport(endpoint);
await client.connect(transport);

try {
  const tools = await client.listTools();
  if (tools.tools.length !== 14) throw new Error(`14 outils attendus en production, ${tools.tools.length} reçus.`);
  const renderTools = tools.tools.filter((tool) => tool.name.startsWith("render_"));
  if (renderTools.length !== 5 || renderTools.some((tool) => typeof tool._meta?.ui?.resourceUri !== "string")) {
    throw new Error("Les cinq outils de rendu ne déclarent pas correctement leur ressource MCP Apps.");
  }

  const status = await client.callTool({ name: "get_catalog_status", arguments: {} });
  if (status.isError || status.structuredContent?.data?.state !== "healthy") throw new Error("Le catalogue distant n’est pas sain.");

  const search = await client.callTool({ name: "search_recipes", arguments: { limit: 3 } });
  const recipes = search.structuredContent?.data;
  if (!Array.isArray(recipes) || recipes.length !== 3 || recipes.some((recipe) => typeof recipe.image_url !== "string")) {
    throw new Error("La recherche distante ne renvoie pas trois cartes recettes illustrées.");
  }
  const gallery = await client.callTool({
    name: "render_recipe_gallery",
    arguments: { recipe_ids: recipes.map((recipe) => recipe.id), search: {}, next_cursor: search.structuredContent?.next_cursor ?? null },
  });
  if (gallery.isError || gallery.structuredContent?.data?.view !== "recipe_gallery") throw new Error("Le rendu distant de la galerie a échoué.");

  const ui = await client.readResource({ uri: "ui://agentvegan/recipe-gallery/v1.html" });
  const resource = ui.contents[0];
  if (!resource || resource.mimeType !== "text/html;profile=mcp-app" || !("text" in resource) || !resource.text.includes("AgentVegan interactif")) {
    throw new Error("La ressource UI distante est absente ou invalide.");
  }

  process.stdout.write(`Production vérifiée : 14 outils, galerie illustrée et MCP App sur ${endpoint.href}.\n`);
} finally {
  await client.close();
}

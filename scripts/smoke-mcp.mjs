import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createAgentVeganMcp } from "../dist/src/mcp.js";
import { loadLocalService } from "../dist/src/local.js";

const service = await loadLocalService();
const server = createAgentVeganMcp(service);
const client = new Client({ name: "agentvegan-smoke", version: "1.0.0" });
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
try {
  const tools = await client.listTools();
  if (tools.tools.length !== 14) throw new Error(`14 outils attendus, ${tools.tools.length} reçus.`);
  if (tools.tools.filter((tool) => tool.name.startsWith("render_")).length !== 5) throw new Error("5 outils MCP Apps attendus.");
  const result = await client.callTool({ name: "compare_nutrition", arguments: { entities: ["tofu", "seitan"], basis: "100_g" } });
  if (result.isError || !result.structuredContent?.dataset_version) throw new Error("L’appel MCP compare_nutrition a échoué.");
  const resource = await client.readResource({ uri: "agentvegan://catalog/manifest" });
  if (!resource.contents.length) throw new Error("La ressource manifeste MCP est vide.");
  const ui = await client.readResource({ uri: "ui://agentvegan/recipe-gallery/v1.html" });
  if (ui.contents[0]?.mimeType !== "text/html;profile=mcp-app" || !("text" in ui.contents[0]) || !ui.contents[0].text.includes("AgentVegan interactif")) {
    throw new Error("La ressource MCP Apps n’est pas disponible ou possède un MIME invalide.");
  }
  const search = await client.callTool({ name: "search_recipes", arguments: { limit: 3 } });
  const ids = search.structuredContent?.data?.map?.((recipe) => recipe.id);
  const gallery = await client.callTool({ name: "render_recipe_gallery", arguments: { recipe_ids: ids, search: {}, next_cursor: search.structuredContent?.next_cursor ?? null } });
  if (gallery.isError || gallery.structuredContent?.data?.view !== "recipe_gallery") throw new Error("Le rendu interactif de recettes a échoué.");
} finally {
  await client.close();
  await server.close();
}
process.stdout.write("MCP SDK v2 : 9 outils de données, 5 rendus MCP Apps et ressources UI vérifiés.\n");

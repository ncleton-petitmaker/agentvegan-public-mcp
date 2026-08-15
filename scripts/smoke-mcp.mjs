import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createAgentVeganMcp } from "../dist/src/mcp.js";
import { loadLocalService } from "../dist/src/local.js";

const service = await loadLocalService();
const server = createAgentVeganMcp(service);
const client = new Client({ name: "agentvegan-smoke", version: "2.0.10" });
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
try {
  const tools = await client.listTools();
  if (tools.tools.length !== 14) throw new Error(`14 outils attendus, ${tools.tools.length} reçus.`);
  const appTools = tools.tools.filter((tool) => typeof tool._meta?.ui?.resourceUri === "string");
  if (appTools.length !== 6) throw new Error(`6 points d’entrée MCP Apps attendus, ${appTools.length} reçus.`);
  if (appTools.some((tool) => typeof tool._meta?.["ui/resourceUri"] !== "string" || typeof tool._meta?.["openai/outputTemplate"] !== "string")) {
    throw new Error("Les métadonnées MCP Apps standard et ChatGPT sont incomplètes.");
  }
  const result = await client.callTool({ name: "compare_nutrition", arguments: { entities: ["tofu", "seitan"], basis: "100_g" } });
  if (result.isError || !result.structuredContent?.dataset_version) throw new Error("L’appel MCP compare_nutrition a échoué.");
  const resource = await client.readResource({ uri: "agentvegan://catalog/manifest" });
  if (!resource.contents.length) throw new Error("La ressource manifeste MCP est vide.");
  const ui = await client.readResource({ uri: "ui://agentvegan/kitchen/v12.html" });
  if (ui.contents[0]?.mimeType !== "text/html;profile=mcp-app" || !("text" in ui.contents[0]) || !ui.contents[0].text.includes("Agent Vegan")) {
    throw new Error("La ressource MCP Apps n’est pas disponible ou possède un MIME invalide.");
  }
  const gallery = await client.callTool({ name: "explore_recipes", arguments: { limit: 3 } });
  if (gallery.isError || gallery.structuredContent?.data?.view !== "recipe_gallery") throw new Error("Le rendu interactif de recettes a échoué.");
  const recipeId = gallery.structuredContent?.data?.items?.[0]?.id;
  const kitchen = await client.callTool({ name: "cook_recipe", arguments: { recipe_id: recipeId } });
  const recipe = kitchen.structuredContent?.data?.recipe;
  const steps = recipe?.guide?.steps;
  if (kitchen.isError || !Array.isArray(steps) || steps.length !== recipe?.step_count) throw new Error("Le cockpit cuisine ne contient pas toutes les étapes.");
  if (steps.some((step) => !step.beginner_instruction || !step.image?.startsWith("https://agentvegan.org/") || !step.image_alt)) {
    throw new Error("Une étape du cockpit n’a pas son texte ou son image publique.");
  }
} finally {
  await client.close();
  await server.close();
}
process.stdout.write("MCP SDK v2 : 9 outils publics, Agent Vegan et toutes les étapes illustrées vérifiés.\n");

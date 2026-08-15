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
  if (tools.tools.length !== 9) throw new Error(`9 outils attendus, ${tools.tools.length} reçus.`);
  const result = await client.callTool({ name: "compare_nutrition", arguments: { entities: ["tofu", "seitan"], basis: "100_g" } });
  if (result.isError || !result.structuredContent?.dataset_version) throw new Error("L’appel MCP compare_nutrition a échoué.");
  const resource = await client.readResource({ uri: "agentvegan://catalog/manifest" });
  if (!resource.contents.length) throw new Error("La ressource manifeste MCP est vide.");
} finally {
  await client.close();
  await server.close();
}
process.stdout.write("MCP SDK v2 : 9 outils, appel structuré et ressource manifeste vérifiés.\n");

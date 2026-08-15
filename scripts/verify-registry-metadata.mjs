import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const [server, packageMetadata, pluginMcp] = await Promise.all([
  readFile(resolve(root, "server.json"), "utf8").then(JSON.parse),
  readFile(resolve(root, "package.json"), "utf8").then(JSON.parse),
  readFile(resolve(root, "plugins/agentvegan/.mcp.json"), "utf8").then(JSON.parse),
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(server.$schema === "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json", "Schéma MCP Registry inattendu.");
assert(typeof server.description === "string" && server.description.length <= 100, "La description du registre dépasse 100 caractères.");
assert(server.name === packageMetadata.mcpName, "server.json.name et package.json.mcpName divergent.");
assert(server.version === packageMetadata.version, "Les versions du registre et du paquet divergent.");
const remote = server.remotes?.find((item) => item.type === "streamable-http");
assert(remote?.url === "https://mcp.agentvegan.org/mcp", "Le transport distant MCP est absent ou incorrect.");
const npmPackage = server.packages?.find((item) => item.registryType === "npm");
assert(npmPackage?.identifier === packageMetadata.name, "L’identifiant npm du registre diverge du paquet.");
assert(npmPackage?.version === packageMetadata.version, "La version npm du registre diverge du paquet.");
assert(npmPackage?.transport?.type === "stdio", "Le transport du paquet doit être stdio.");
assert(pluginMcp.mcpServers?.agentvegan?.url === remote.url, "Le plugin et le registre n’utilisent pas la même URL MCP.");

process.stdout.write("Métadonnées registre, npm et plugin alignées.\n");

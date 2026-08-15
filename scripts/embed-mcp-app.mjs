import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const input = resolve("web/dist/index.html");
const output = resolve("src/generated/mcp-app-html.ts");
const html = await readFile(input, "utf8");

if (!html.includes("AgentVegan interactif") || !html.includes("ui/notifications")) {
  throw new Error("Le bundle MCP Apps ne contient pas les marqueurs attendus ; génération refusée.");
}

await mkdir(resolve("src/generated"), { recursive: true });
await writeFile(
  output,
  `// Fichier généré par scripts/embed-mcp-app.mjs. Ne pas modifier à la main.\nexport const MCP_APP_HTML = ${JSON.stringify(html)};\n`,
  "utf8",
);

process.stdout.write(`MCP App embarquée : ${Buffer.byteLength(html)} octets.\n`);

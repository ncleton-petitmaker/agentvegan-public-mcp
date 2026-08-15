import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const [configuration, manifest] = await Promise.all([
  readFile(resolve(root, "wrangler.jsonc"), "utf8").then(JSON.parse),
  readFile(resolve(root, "data/manifest.json"), "utf8").then(JSON.parse),
]);
const database = configuration.d1_databases?.find((item) => item.binding === "PUBLIC_DATA");
if (!database) throw new Error("Le binding D1 PUBLIC_DATA est absent de wrangler.jsonc.");
if (!/^[a-f0-9-]{20,}$/iu.test(database.database_id) || database.database_id.includes("REPLACE")) {
  throw new Error("Déploiement refusé : remplacez REPLACE_AFTER_D1_CREATION par l’identifiant de la nouvelle base D1 validée.");
}
if (!configuration.routes?.some((route) => route.pattern === "mcp.agentvegan.org" && route.custom_domain === true)) {
  throw new Error("Déploiement refusé : le domaine personnalisé doit être exactement mcp.agentvegan.org.");
}
if (configuration.observability?.logs?.invocation_logs !== false) {
  throw new Error("Déploiement refusé : les invocation_logs Cloudflare doivent rester désactivés pour ne pas journaliser les requêtes.");
}
if (!manifest.dataset_version || manifest.counts?.ingredients !== manifest.counts?.ingredients_classified_for_substitution) {
  throw new Error("Déploiement refusé : manifeste absent ou classification de substitution incomplète.");
}
const whoami = spawnSync("npx", ["wrangler", "whoami"], { cwd: root, encoding: "utf8" });
if (whoami.status !== 0 || /not authenticated|not logged in/iu.test(`${whoami.stdout}\n${whoami.stderr}`)) {
  throw new Error("Déploiement refusé : Wrangler n’est pas authentifié. Exécutez `npx wrangler login`, puis relancez.");
}
process.stdout.write(`Préflight réussi pour ${manifest.dataset_version} et D1 ${database.database_name}.\n`);

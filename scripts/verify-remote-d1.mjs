import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(await readFile(resolve(root, "data/manifest.json"), "utf8"));
const query = "SELECT (SELECT value FROM metadata WHERE key='dataset_version') AS dataset_version, (SELECT value FROM metadata WHERE key='dataset_state') AS dataset_state, (SELECT count(*) FROM recipes) AS recipes, (SELECT count(*) FROM ingredients) AS ingredients, (SELECT count(*) FROM nutrients) AS nutrients, (SELECT count(*) FROM retailers) AS retailers, (SELECT count(*) FROM availability_evidence) AS availability_evidence, (SELECT count(*) FROM substitution_rules) AS substitution_rules, (SELECT count(*) FROM plant_products) AS plant_products, (SELECT count(*) FROM source_references) AS sources;";
const result = spawnSync("npx", ["wrangler", "d1", "execute", "PUBLIC_DATA", "--remote", "--json", "--command", query], { cwd: root, encoding: "utf8" });
if (result.status !== 0) throw new Error(`Vérification D1 distante impossible : ${result.stderr || result.stdout}`);
let payload;
try { payload = JSON.parse(result.stdout); } catch { throw new Error(`Réponse Wrangler D1 non JSON : ${result.stdout}`); }
const row = payload?.[0]?.results?.[0];
if (!row || row.dataset_state !== "healthy" || row.dataset_version !== manifest.dataset_version) {
  throw new Error(`D1 distante invalide : version ${row?.dataset_version ?? "absente"}, état ${row?.dataset_state ?? "absent"}.`);
}
for (const key of ["recipes", "ingredients", "nutrients", "retailers", "availability_evidence", "substitution_rules", "plant_products", "sources"]) {
  if (row[key] !== manifest.counts[key]) throw new Error(`Compteur D1 invalide pour ${key} : ${row[key]} au lieu de ${manifest.counts[key]}.`);
}
process.stdout.write(`D1 distante ${row.dataset_version} validée avec tous les compteurs attendus.\n`);

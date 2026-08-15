import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const defaultSource = resolve(root, "../agentvegan-landing/public/data/v1");
const sourceArg = process.argv.indexOf("--source");
const source = sourceArg >= 0 ? process.argv[sourceArg + 1] : defaultSource;

if (!source) {
  throw new Error("--source doit être suivi d’un chemin ou d’une URL HTTPS.");
}

async function load(location, filename) {
  if (/^https:\/\//u.test(location)) {
    const response = await fetch(`${location.replace(/\/$/u, "")}/${filename}`);
    if (!response.ok) {
      throw new Error(`Téléchargement impossible (${response.status}) : ${response.url}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }
  return readFile(resolve(location, filename));
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function atomicWrite(path, contents) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, contents);
  await rename(temporary, path);
}

const [manifestBuffer, catalogBuffer, baselineBuffer] = await Promise.all([
  load(source, "manifest.json"),
  load(source, "catalog.json"),
  readFile(resolve(root, "config/minimum-coverage.json")),
]);
const manifest = JSON.parse(manifestBuffer.toString("utf8"));
const catalog = JSON.parse(catalogBuffer.toString("utf8"));
const baseline = JSON.parse(baselineBuffer.toString("utf8"));

if (manifest.schema_version !== "1.0.0" || catalog.schema_version !== "1.0.0") {
  throw new Error("Version de schéma publique non prise en charge ; attendu : 1.0.0.");
}
if (manifest.dataset_version !== catalog.dataset_version) {
  throw new Error("Le manifeste et le catalogue ne portent pas la même dataset_version.");
}
const expectedHash = manifest.files?.["catalog.json"]?.sha256;
const actualHash = sha256(catalogBuffer);
if (!expectedHash || actualHash !== expectedHash) {
  throw new Error(`Empreinte catalog.json invalide : attendu ${expectedHash ?? "absent"}, obtenu ${actualHash}.`);
}
for (const [entity, minimum] of Object.entries(baseline)) {
  const actual = manifest.counts?.[entity];
  if (!Number.isInteger(actual) || actual < minimum) {
    throw new Error(`Régression de couverture bloquée pour ${entity} : ${actual ?? "absent"} < ${minimum}. Corriger la projection source et mettre à jour la baseline dans une revue dédiée.`);
  }
}
if (manifest.counts.ingredients !== manifest.counts.ingredients_classified_for_substitution) {
  throw new Error("Chaque ingrédient doit posséder un statut de substitution avant import.");
}
if (catalog.ingredients.some((ingredient) => !["substitutable", "sans_substitut_pertinent", "non_applicable"].includes(ingredient.substitution_status))) {
  throw new Error("Un ingrédient possède un statut de substitution inconnu ou invalide.");
}

await Promise.all([
  atomicWrite(resolve(root, "data/catalog.json"), catalogBuffer),
  atomicWrite(resolve(root, "data/manifest.json"), manifestBuffer),
]);

process.stdout.write(`Catalogue ${manifest.dataset_version} synchronisé et vérifié (${actualHash}).\n`);

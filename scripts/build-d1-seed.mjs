import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const [catalog, manifest] = await Promise.all([
  readFile(resolve(root, "data/catalog.json"), "utf8").then(JSON.parse),
  readFile(resolve(root, "data/manifest.json"), "utf8").then(JSON.parse),
]);

if (catalog.dataset_version !== manifest.dataset_version) {
  throw new Error("Le manifeste et le catalogue D1 ne portent pas la même version.");
}

const q = (value) => value === null || value === undefined ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;
const number = (value) => Number.isFinite(value) ? String(value) : "NULL";
const json = (value) => q(JSON.stringify(value));
const lines = [
  "PRAGMA foreign_keys = ON;",
  "DELETE FROM metadata;",
  "DELETE FROM recipe_nutrients;",
  "DELETE FROM recipe_ingredients;",
  "DELETE FROM ingredient_aliases;",
  "DELETE FROM availability_evidence;",
  "DELETE FROM substitution_rules;",
  "DELETE FROM plant_product_offers;",
  "DELETE FROM recipes;",
  "DELETE FROM ingredients;",
  "DELETE FROM nutrients;",
  "DELETE FROM retailers;",
  "DELETE FROM plant_products;",
  "DELETE FROM source_references;",
];

const metadata = {
  dataset_version: catalog.dataset_version,
  generated_at: catalog.generated_at,
  checked_at: catalog.checked_at,
  manifest: JSON.stringify(manifest),
  dataset_state: "healthy",
};
for (const [key, value] of Object.entries(metadata)) {
  lines.push(`INSERT INTO metadata (key, value) VALUES (${q(key)}, ${q(value)});`);
}
for (const item of catalog.sources ?? catalog.source_references) {
  lines.push(`INSERT INTO source_references (id, label, json) VALUES (${q(item.id)}, ${q(item.label)}, ${json(item)});`);
}
for (const item of catalog.nutrients) {
  lines.push(`INSERT INTO nutrients (id, label, json) VALUES (${q(item.id)}, ${q(item.label)}, ${json(item)});`);
}
for (const item of catalog.retailers) {
  lines.push(`INSERT INTO retailers (id, label, json) VALUES (${q(item.id)}, ${q(item.label)}, ${json(item)});`);
}
for (const item of catalog.ingredients) {
  lines.push(`INSERT INTO ingredients (id, name, normalized_name, marketplace_target_id, substitution_status, json) VALUES (${q(item.id)}, ${q(item.name)}, ${q(item.name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase())}, ${q(item.marketplace_target_id)}, ${q(item.substitution_status)}, ${json(item)});`);
  const normalizedAliases = new Set();
  for (const alias of item.aliases) {
    const normalized = alias.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    if (normalizedAliases.has(normalized)) continue;
    normalizedAliases.add(normalized);
    lines.push(`INSERT INTO ingredient_aliases (ingredient_id, alias, normalized_alias) VALUES (${q(item.id)}, ${q(alias)}, ${q(normalized)});`);
  }
}
for (const item of catalog.recipes) {
  const normalizedTitle = item.title.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  lines.push(`INSERT INTO recipes (id, slug, title, normalized_title, meal, prep_minutes, json) VALUES (${q(item.id)}, ${q(item.slug)}, ${q(item.title)}, ${q(normalizedTitle)}, ${q(item.meal)}, ${number(item.prep_minutes)}, ${json(item)});`);
  for (const ingredient of item.ingredients) {
    lines.push(`INSERT OR IGNORE INTO recipe_ingredients (recipe_id, ingredient_id) VALUES (${q(item.id)}, ${q(ingredient.ingredient_id)});`);
  }
  for (const nutrient of item.nutrition?.priority_scores ?? []) {
    lines.push(`INSERT INTO recipe_nutrients (recipe_id, nutrient_id, value_min, value_max, status) VALUES (${q(item.id)}, ${q(nutrient.key)}, ${number(nutrient.amount_per_serving_min)}, ${number(nutrient.amount_per_serving_max)}, ${q(nutrient.status)});`);
  }
}
for (const item of catalog.availability_evidence) {
  lines.push(`INSERT INTO availability_evidence (id, ingredient_id, target_id, retailer_id, status, checked_at, json) VALUES (${q(item.id)}, ${q(item.ingredient_id)}, ${q(item.target_id)}, ${q(item.retailer_id)}, ${q(item.status)}, ${q(item.checked_at)}, ${json(item)});`);
}
for (const item of catalog.substitution_rules) {
  lines.push(`INSERT INTO substitution_rules (id, ingredient_id, replacement_ingredient_id, recipe_id, json) VALUES (${q(item.id)}, ${q(item.ingredient_id)}, ${q(item.replacement_ingredient_id)}, ${q(item.recipe_id)}, ${json(item)});`);
}
for (const item of catalog.plant_products) {
  const normalizedName = item.name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  lines.push(`INSERT INTO plant_products (id, name, normalized_name, brand, category_id, json) VALUES (${q(item.id)}, ${q(item.name)}, ${q(normalizedName)}, ${q(item.brand)}, ${q(item.category_id)}, ${json(item)});`);
  for (const offer of item.offers) {
    lines.push(`INSERT INTO plant_product_offers (product_id, retailer_id, availability, checked_at, json) VALUES (${q(item.id)}, ${q(offer.retailer_id)}, ${q(offer.availability)}, ${q(offer.checked_at)}, ${json(offer)});`);
  }
}

const outputDirectory = resolve(root, "data/d1-seed");
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
const maximumChunkBytes = 750_000;
const chunks = [];
let current = [];
let currentBytes = 0;
for (const line of lines) {
  const lineBytes = Buffer.byteLength(line) + 1;
  if (current.length && currentBytes + lineBytes > maximumChunkBytes) {
    chunks.push(current);
    current = [];
    currentBytes = 0;
  }
  current.push(line);
  currentBytes += lineBytes;
}
if (current.length) chunks.push(current);
for (let index = 0; index < chunks.length; index += 1) {
  const filename = `${String(index + 1).padStart(4, "0")}.sql`;
  const output = resolve(outputDirectory, filename);
  const temporary = `${output}.tmp-${process.pid}`;
  await writeFile(temporary, `${chunks[index].join("\n")}\n`);
  await rename(temporary, output);
}
await writeFile(resolve(outputDirectory, "manifest.json"), `${JSON.stringify({ dataset_version: catalog.dataset_version, files: chunks.length, statements: lines.length }, null, 2)}\n`);
process.stdout.write(`Seed D1 ${catalog.dataset_version} généré (${lines.length} instructions, ${chunks.length} fichiers).\n`);

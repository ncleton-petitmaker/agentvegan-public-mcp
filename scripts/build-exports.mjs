import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

const root = resolve(import.meta.dirname, "..");
const outputDirectory = resolve(root, "exports/v1");
const [catalog, sourceManifest] = await Promise.all([
  readFile(resolve(root, "data/catalog.json"), "utf8").then(JSON.parse),
  readFile(resolve(root, "data/manifest.json"), "utf8").then(JSON.parse),
]);

if (catalog.dataset_version !== sourceManifest.dataset_version) {
  throw new Error("data/catalog.json et data/manifest.json ne portent pas la même version.");
}

await mkdir(outputDirectory, { recursive: true });
const files = {};

function hash(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function output(filename, buffer, mediaType, encoding, count) {
  const target = resolve(outputDirectory, filename);
  const temporary = `${target}.tmp-${process.pid}`;
  await writeFile(temporary, buffer);
  await rename(temporary, target);
  files[filename] = {
    sha256: hash(buffer),
    bytes: buffer.byteLength,
    media_type: mediaType,
    ...(encoding ? { content_encoding: encoding } : {}),
    count,
  };
}

async function json(filename, value, count) {
  const buffer = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  await output(filename, buffer, "application/json", null, count);
}

async function jsonlGzip(filename, values) {
  const jsonl = `${values.map((value) => JSON.stringify(value)).join("\n")}\n`;
  const buffer = gzipSync(Buffer.from(jsonl), { level: 9, mtime: 0 });
  await output(filename, buffer, "application/x-ndjson", "gzip", values.length);
}

await jsonlGzip("recipes.jsonl.gz", catalog.recipes);
await jsonlGzip("ingredients.jsonl.gz", catalog.ingredients);
await json("nutrients.json", catalog.nutrients, catalog.nutrients.length);
await json("retailers.json", catalog.retailers, catalog.retailers.length);
await jsonlGzip("availability-evidence.jsonl.gz", catalog.availability_evidence);
await jsonlGzip("substitution-rules.jsonl.gz", catalog.substitution_rules);
await jsonlGzip("plant-products.jsonl.gz", catalog.plant_products);
await json("plant-product-categories.json", catalog.plant_product_categories, catalog.plant_product_categories.length);
await json("source-references.json", catalog.source_references, catalog.source_references.length);

const manifest = {
  schema_version: sourceManifest.schema_version,
  dataset_version: catalog.dataset_version,
  generated_at: catalog.generated_at,
  checked_at: catalog.checked_at,
  locale: catalog.locale,
  geographic_scope: catalog.geographic_scope,
  counts: sourceManifest.counts,
  coverage: sourceManifest.coverage,
  files,
  sources: catalog.source_references,
  warnings: sourceManifest.warnings,
};
await json("manifest.json", manifest, Object.keys(files).length);
process.stdout.write(`Exports ${catalog.dataset_version} générés (${Object.keys(files).length} fichiers de données).\n`);

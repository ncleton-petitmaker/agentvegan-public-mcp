import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";

const root = resolve(import.meta.dirname, "..");
const directory = resolve(root, "exports/v1");
const manifest = JSON.parse(await readFile(resolve(directory, "manifest.json"), "utf8"));
const sourceManifest = JSON.parse(await readFile(resolve(root, "data/manifest.json"), "utf8"));

if (manifest.dataset_version !== sourceManifest.dataset_version) {
  throw new Error("Les exports sont périmés par rapport au manifeste source.");
}
for (const [filename, descriptor] of Object.entries(manifest.files)) {
  const buffer = await readFile(resolve(directory, filename));
  const actualHash = createHash("sha256").update(buffer).digest("hex");
  if (descriptor.sha256 !== actualHash || descriptor.bytes !== buffer.byteLength) {
    throw new Error(`Export invalide : ${filename}.`);
  }
  const decoded = descriptor.content_encoding === "gzip" ? gunzipSync(buffer).toString("utf8") : buffer.toString("utf8");
  const count = filename.endsWith(".jsonl.gz")
    ? decoded.trimEnd().split("\n").filter(Boolean).length
    : JSON.parse(decoded).length;
  if (descriptor.count !== count) {
    throw new Error(`Nombre d’objets invalide dans ${filename} : ${count} au lieu de ${descriptor.count}.`);
  }
}
process.stdout.write(`Exports ${manifest.dataset_version} vérifiés.\n`);

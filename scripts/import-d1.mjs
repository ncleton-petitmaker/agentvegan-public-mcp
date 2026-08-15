import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const mode = process.argv.includes("--remote") ? "--remote" : "--local";
const databaseArgument = process.argv.indexOf("--database");
const database = databaseArgument >= 0 ? process.argv[databaseArgument + 1] : "PUBLIC_DATA";
if (!database) throw new Error("--database doit être suivi d’un nom, identifiant ou binding D1.");
const seedDirectory = resolve(root, "data/d1-seed");
const manifest = JSON.parse(await readFile(resolve(seedDirectory, "manifest.json"), "utf8"));
const files = (await readdir(seedDirectory)).filter((name) => name.endsWith(".sql")).sort();
if (!files.length || files.length !== manifest.files) {
  throw new Error(`Seed D1 incomplet : ${files.length} fichiers présents, ${manifest.files ?? "nombre absent"} attendus.`);
}

for (const [index, filename] of files.entries()) {
  process.stderr.write(`Import D1 ${index + 1}/${files.length} : ${filename}\n`);
  const result = spawnSync("npx", ["wrangler", "d1", "execute", database, mode, "--file", resolve(seedDirectory, filename)], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`Import D1 interrompu sur ${filename} (code ${result.status ?? "inconnu"}).`);
  }
}
process.stdout.write(`Seed ${manifest.dataset_version} importé dans D1 (${mode}).\n`);

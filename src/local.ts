import { access, readFile } from "node:fs/promises";
import type { PublicCatalog, PublicManifest } from "./contracts.js";
import { JsonCatalogRepository } from "./repository-json.js";
import { PublicDataService } from "./service.js";

export async function loadLocalService(): Promise<PublicDataService> {
  const candidates = [new URL("../../data/", import.meta.url), new URL("../data/", import.meta.url)];
  let dataRoot: URL | undefined;
  for (const candidate of candidates) {
    try {
      await access(new URL("manifest.json", candidate));
      dataRoot = candidate;
      break;
    } catch {}
  }
  if (!dataRoot) throw new Error("Catalogue local introuvable. Réinstallez le paquet ou exécutez npm run data:sync.");
  const [catalog, manifest] = await Promise.all([
    readFile(new URL("catalog.json", dataRoot), "utf8").then((value) => JSON.parse(value) as PublicCatalog),
    readFile(new URL("manifest.json", dataRoot), "utf8").then((value) => JSON.parse(value) as PublicManifest),
  ]);
  return new PublicDataService(new JsonCatalogRepository(catalog, manifest));
}

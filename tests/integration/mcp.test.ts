import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PublicCatalog, PublicManifest } from "../../src/contracts.js";
import { createAgentVeganMcp } from "../../src/mcp.js";
import { JsonCatalogRepository } from "../../src/repository-json.js";
import { PublicDataService } from "../../src/service.js";

let service: PublicDataService;

beforeAll(async () => {
  const [catalog, manifest] = await Promise.all([
    readFile(resolve("data/catalog.json"), "utf8").then((value) => JSON.parse(value) as PublicCatalog),
    readFile(resolve("data/manifest.json"), "utf8").then((value) => JSON.parse(value) as PublicManifest),
  ]);
  service = new PublicDataService(new JsonCatalogRepository(catalog, manifest), () => new Date("2026-08-15T12:00:00.000Z"));
});

describe("MCP officiel", () => {
  it("annonce neuf outils en lecture seule et exécute un parcours réel", async () => {
    const server = createAgentVeganMcp(service);
    const client = new Client({ name: "agentvegan-tests", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
        "compare_nutrition", "find_stores_for_ingredient", "find_substitutes", "get_catalog_status", "get_ingredient", "get_recipe", "search_ingredients", "search_plant_products", "search_recipes",
      ]);
      expect(tools.tools.every((tool) => tool.annotations?.readOnlyHint === true && tool.annotations.destructiveHint === false)).toBe(true);
      const result = await client.callTool({ name: "find_substitutes", arguments: { ingredient: "oeuf" } });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({ dataset_version: expect.any(String), next_cursor: null });
      const resource = await client.readResource({ uri: "agentvegan://catalog/manifest" });
      expect(resource.contents[0]).toMatchObject({ mimeType: "application/json" });
      const record = await client.readResource({ uri: "agentvegan://entities/nutrient/iron_mg" });
      const first = record.contents[0];
      expect(first && "text" in first ? JSON.parse(first.text) : null).toMatchObject({ data: { id: "iron_mg" } });
    } finally {
      await client.close();
      await server.close();
    }
  });
});

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
  it("conserve les neuf outils de données, ajoute cinq rendus et exécute les parcours interactifs", async () => {
    const server = createAgentVeganMcp(service);
    const client = new Client({ name: "agentvegan-tests", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      expect(client.getServerVersion()).toMatchObject({
        name: "agentvegan",
        title: "Agent Vegan",
        description: expect.stringContaining("recettes illustrées"),
        websiteUrl: "https://mcp.agentvegan.org/",
        icons: expect.arrayContaining([{ src: "https://mcp.agentvegan.org/logo.png", mimeType: "image/png", sizes: ["512x512"] }]),
      });
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
        "compare_nutrition", "compare_nutrition_interactively", "cook_recipe", "explore_ingredient", "explore_plant_products", "explore_recipes", "find_stores_for_ingredient", "find_substitutes", "get_catalog_status", "get_ingredient", "get_recipe", "search_ingredients", "search_plant_products", "search_recipes",
      ]);
      expect(tools.tools.every((tool) => tool.annotations?.readOnlyHint === true && tool.annotations.destructiveHint === false)).toBe(true);
      const appTools = tools.tools.filter((tool) => typeof (tool._meta?.ui as { resourceUri?: unknown } | undefined)?.resourceUri === "string");
      expect(appTools.map((tool) => tool.name).sort()).toEqual(["compare_nutrition_interactively", "cook_recipe", "explore_ingredient", "explore_plant_products", "explore_recipes", "get_recipe", "search_recipes"]);
      expect(appTools.every((tool) => typeof tool._meta?.["ui/resourceUri"] === "string" && typeof tool._meta?.["openai/outputTemplate"] === "string")).toBe(true);

      const result = await client.callTool({ name: "find_substitutes", arguments: { ingredient: "oeuf" } });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({ dataset_version: expect.any(String), next_cursor: null });

      const search = await client.callTool({ name: "search_recipes", arguments: { limit: 3 } });
      const searchEnvelope = search.structuredContent as { data: Array<{ id: string; image_url: string }>; next_cursor: string | null };
      expect(searchEnvelope.data).toHaveLength(3);
      expect(searchEnvelope.data.every((recipe) => recipe.image_url.startsWith("https://agentvegan.org/"))).toBe(true);
      const gallery = await client.callTool({ name: "explore_recipes", arguments: { limit: 3 } });
      expect(gallery.isError).not.toBe(true);
      expect(gallery.structuredContent).toMatchObject({ data: { view: "recipe_gallery", items: expect.any(Array), next_cursor: expect.any(String) } });

      const detail = await client.callTool({ name: "cook_recipe", arguments: { recipe_id: searchEnvelope.data[0]?.id } });
      expect(detail.isError).not.toBe(true);
      const detailEnvelope = detail.structuredContent as { data: { recipe: { step_count?: number; guide?: { steps?: Array<{ beginner_instruction?: string; duration_minutes?: number; image?: string; image_alt?: string }> } } } };
      const steps = detailEnvelope.data.recipe.guide?.steps ?? [];
      const stepImages = steps.map((step) => step.image).filter(Boolean);
      expect(stepImages.length).toBeGreaterThan(0);
      expect(stepImages.every((url) => url?.startsWith("https://agentvegan.org/"))).toBe(true);
      expect(steps.every((step) => typeof step.beginner_instruction === "string" && step.beginner_instruction.length > 0)).toBe(true);
      expect(steps.every((step) => typeof step.duration_minutes === "number" && typeof step.image_alt === "string")).toBe(true);
      expect(detailEnvelope.data.recipe.step_count).toBe(steps.length);

      const products = await client.callTool({ name: "search_plant_products", arguments: { limit: 3 } });
      const productEnvelope = products.structuredContent as { data: Array<{ id: string }> };
      const productGallery = await client.callTool({ name: "explore_plant_products", arguments: { limit: 3 } });
      expect(productGallery).toMatchObject({ structuredContent: { data: { view: "plant_product_gallery", items: expect.any(Array) } } });

      const comparison = await client.callTool({ name: "compare_nutrition_interactively", arguments: { entities: ["tofu", "seitan"], basis: "100_g" } });
      expect(comparison).toMatchObject({ structuredContent: { data: { view: "nutrition_comparison", basis: "100_g", series: expect.any(Array) } } });

      const ingredient = await client.callTool({ name: "explore_ingredient", arguments: { ingredient: "tahini" } });
      expect(ingredient).toMatchObject({ structuredContent: { data: { view: "ingredient_explorer", ingredient: { name: expect.any(String) } } } });

      const resource = await client.readResource({ uri: "agentvegan://catalog/manifest" });
      expect(resource.contents[0]).toMatchObject({ mimeType: "application/json" });
      const record = await client.readResource({ uri: "agentvegan://entities/nutrient/iron_mg" });
      const first = record.contents[0];
      expect(first && "text" in first ? JSON.parse(first.text) : null).toMatchObject({ data: { id: "iron_mg" } });

      const ui = await client.readResource({ uri: "ui://agentvegan/kitchen/v7.html" });
      const uiContent = ui.contents[0];
      expect(uiContent).toMatchObject({ mimeType: "text/html;profile=mcp-app", _meta: { ui: { domain: "https://mcp.agentvegan.org" } } });
      expect(uiContent && "text" in uiContent ? uiContent.text : "").toContain("Agent Vegan");
    } finally {
      await client.close();
      await server.close();
    }
  });
});

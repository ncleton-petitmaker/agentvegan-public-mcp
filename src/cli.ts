#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import process from "node:process";
import { createAgentVeganMcp } from "./mcp.js";
import { errorPayload } from "./errors.js";
import { loadLocalService } from "./local.js";

function argumentsMap(args: string[]): { positionals: string[]; options: Record<string, string | boolean> } {
  const positionals: string[] = [];
  const options: Record<string, string | boolean> = {};
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value) continue;
    if (!value.startsWith("--")) { positionals.push(value); continue; }
    const key = value.slice(2).replaceAll("-", "_");
    const next = args[index + 1];
    if (next && !next.startsWith("--")) { options[key] = next; index += 1; }
    else options[key] = true;
  }
  return { positionals, options };
}

function text(options: Record<string, string | boolean>, key: string): string | undefined {
  const value = options[key];
  return typeof value === "string" ? value : undefined;
}

function number(options: Record<string, string | boolean>, key: string): number | undefined {
  const value = text(options, key);
  return value === undefined ? undefined : Number(value);
}

function boolean(options: Record<string, string | boolean>, key: string): boolean | undefined {
  const value = options[key];
  if (value === true) return true;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return undefined;
}

function requireValue(value: string | undefined, usage: string): string {
  if (!value) throw new Error(`Argument requis. Usage : ${usage}`);
  return value;
}

const help = `AgentVegan Public Data CLI

Commandes :
  mcp-stdio
  search-recipes [--query texte] [--ingredients tofu,brocoli] [--max-time-minutes 30] [--nutrient iron_mg] [--nutrient-minimum 5]
  get-recipe ID
  search-ingredients [--query texte]
  get-ingredient ID_OU_NOM
  find-stores INGREDIENT [--retailer ID] [--status listed]
  find-substitutes INGREDIENT [--recipe-id ID]
  search-products [--query texte] [--brand marque] [--category ID] [--in-stock-only]
  compare-nutrition ENTITE1,ENTITE2 --basis 100_g|portion|recette
  catalog-status

Toutes les commandes de liste acceptent --limit 1..50 et --cursor CURSEUR.`;

async function main(): Promise<void> {
  const command = process.argv[2];
  const parsed = argumentsMap(process.argv.slice(3));
  if (!command || command === "help" || command === "--help") {
    process.stdout.write(`${help}\n`);
    return;
  }
  const service = await loadLocalService();
  if (command === "mcp-stdio") {
    serveStdio(() => createAgentVeganMcp(service), { onerror: (error) => process.stderr.write(`${error.message}\n`) });
    return;
  }
  const limit = number(parsed.options, "limit");
  const cursor = text(parsed.options, "cursor");
  let result;
  switch (command) {
    case "search-recipes":
      result = await service.searchRecipes({
        query: text(parsed.options, "query"),
        ingredients: text(parsed.options, "ingredients")?.split(",").map((item) => item.trim()).filter(Boolean),
        meal: text(parsed.options, "meal"),
        max_time_minutes: number(parsed.options, "max_time_minutes"),
        nutrient: text(parsed.options, "nutrient"),
        nutrient_minimum: number(parsed.options, "nutrient_minimum"),
        limit,
        cursor,
      });
      break;
    case "get-recipe": result = await service.getRecipe(requireValue(parsed.positionals[0], "get-recipe ID")); break;
    case "search-ingredients": result = await service.searchIngredients({ query: text(parsed.options, "query"), limit, cursor }); break;
    case "get-ingredient": result = await service.getIngredient(requireValue(parsed.positionals[0], "get-ingredient ID_OU_NOM")); break;
    case "find-stores": result = await service.findStoresForIngredient({ ingredient: requireValue(parsed.positionals[0], "find-stores INGREDIENT"), retailer: text(parsed.options, "retailer"), status: text(parsed.options, "status"), limit, cursor }); break;
    case "find-substitutes": result = await service.findSubstitutes({ ingredient: requireValue(parsed.positionals[0], "find-substitutes INGREDIENT"), recipe_id: text(parsed.options, "recipe_id"), limit, cursor }); break;
    case "search-products": result = await service.searchPlantProducts({ query: text(parsed.options, "query"), brand: text(parsed.options, "brand"), category: text(parsed.options, "category"), retailer: text(parsed.options, "retailer"), in_stock_only: boolean(parsed.options, "in_stock_only"), limit, cursor }); break;
    case "compare-nutrition": result = await service.compareNutrition({ entities: requireValue(parsed.positionals[0], "compare-nutrition ENTITE1,ENTITE2 --basis 100_g").split(",").map((item) => item.trim()).filter(Boolean), basis: requireValue(text(parsed.options, "basis"), "compare-nutrition ENTITE1,ENTITE2 --basis 100_g") as "100_g" | "portion" | "recette" }); break;
    case "catalog-status": result = await service.getCatalogStatus(); break;
    default: throw new Error(`Commande inconnue : ${command}.\n${help}`);
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  const payload = errorPayload(error);
  process.stderr.write(`${JSON.stringify(payload.body)}\n`);
  process.exitCode = payload.status === 404 ? 4 : payload.status === 400 ? 2 : 1;
});

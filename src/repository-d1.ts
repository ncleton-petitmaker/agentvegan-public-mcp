import type {
  AvailabilityEvidence,
  CatalogRepository,
  Ingredient,
  Nutrient,
  Page,
  PlantProduct,
  ProductSearch,
  PublicEntity,
  PublicManifest,
  Recipe,
  RecipeSearch,
  Retailer,
  SourceReference,
  SubstitutionRule,
} from "./contracts.js";
import { PublicDataError } from "./errors.js";
import { decodeCursor, encodeCursor, normalize, parseJson } from "./utils.js";

interface JsonRow { json: string }

export class D1CatalogRepository implements CatalogRepository {
  private manifestPromise?: Promise<PublicManifest>;

  constructor(private readonly database: D1Database) {}

  getManifest(): Promise<PublicManifest> {
    this.manifestPromise ??= this.loadManifest();
    return this.manifestPromise;
  }

  private async loadManifest(): Promise<PublicManifest> {
    const result = await this.database.prepare("SELECT key, value FROM metadata WHERE key IN ('manifest', 'dataset_state')").all<{ key: string; value: string }>();
    const entries = Object.fromEntries(result.results.map((row) => [row.key, row.value]));
    if (entries.dataset_state !== "healthy" || !entries.manifest) {
      throw new PublicDataError("DATASET_UNAVAILABLE", "D1 ne contient aucune version saine du catalogue public.", 503);
    }
    return parseJson<PublicManifest>(entries.manifest);
  }

  private async page<T>(sql: string, bindings: unknown[], limit: number, offset: number, datasetVersion: string): Promise<Page<T>> {
    const statement = this.database.prepare(sql).bind(...bindings, limit + 1, offset);
    const result = await statement.all<JsonRow>();
    const hasNext = result.results.length > limit;
    const items = result.results.slice(0, limit).map((row) => parseJson<T>(row.json));
    return { items, nextCursor: hasNext ? encodeCursor(offset + limit, datasetVersion) : null };
  }

  async searchRecipes(input: RecipeSearch): Promise<Page<Recipe>> {
    const manifest = await this.getManifest();
    const offset = decodeCursor(input.cursor, manifest.dataset_version);
    const where: string[] = [];
    const values: unknown[] = [];
    if (input.query) {
      const pattern = `%${normalize(input.query)}%`;
      where.push("(r.normalized_title LIKE ? OR EXISTS (SELECT 1 FROM recipe_ingredients ri JOIN ingredients i ON i.id = ri.ingredient_id JOIN ingredient_aliases ia ON ia.ingredient_id = i.id WHERE ri.recipe_id = r.id AND ia.normalized_alias LIKE ?))");
      values.push(pattern, pattern);
    }
    if (input.meal) {
      where.push("lower(r.meal) LIKE ?");
      values.push(`%${input.meal.toLowerCase()}%`);
    }
    if (input.maxTimeMinutes !== undefined) {
      where.push("r.prep_minutes <= ?");
      values.push(input.maxTimeMinutes);
    }
    for (const ingredient of input.ingredients ?? []) {
      where.push("EXISTS (SELECT 1 FROM recipe_ingredients ri JOIN ingredient_aliases ia ON ia.ingredient_id = ri.ingredient_id WHERE ri.recipe_id = r.id AND ia.normalized_alias LIKE ?)");
      values.push(`%${normalize(ingredient)}%`);
    }
    if (input.nutrient) {
      where.push("EXISTS (SELECT 1 FROM recipe_nutrients rn WHERE rn.recipe_id = r.id AND rn.nutrient_id = ? AND rn.status <> 'unproven' AND (? IS NULL OR rn.value_min >= ?))");
      values.push(input.nutrient, input.nutrientMinimum ?? null, input.nutrientMinimum ?? null);
    }
    const sql = `SELECT r.json FROM recipes r ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY r.title COLLATE NOCASE, r.id LIMIT ? OFFSET ?`;
    return this.page<Recipe>(sql, values, input.limit, offset, manifest.dataset_version);
  }

  async getRecipe(idOrSlug: string): Promise<Recipe | null> {
    const row = await this.database.prepare("SELECT json FROM recipes WHERE id = ? OR slug = ? OR normalized_title = ? ORDER BY id LIMIT 1")
      .bind(idOrSlug, idOrSlug, normalize(idOrSlug)).first<JsonRow>();
    return row ? parseJson<Recipe>(row.json) : null;
  }

  async searchIngredients(query: string | undefined, limit: number, cursor?: string): Promise<Page<Ingredient>> {
    const manifest = await this.getManifest();
    const offset = decodeCursor(cursor, manifest.dataset_version);
    const needle = normalize(query ?? "");
    const sql = needle
      ? "SELECT DISTINCT i.json, i.name, i.id FROM ingredients i JOIN ingredient_aliases ia ON ia.ingredient_id = i.id WHERE ia.normalized_alias LIKE ? ORDER BY i.name COLLATE NOCASE, i.id LIMIT ? OFFSET ?"
      : "SELECT i.json, i.name, i.id FROM ingredients i ORDER BY i.name COLLATE NOCASE, i.id LIMIT ? OFFSET ?";
    return this.page<Ingredient>(sql, needle ? [`%${needle}%`] : [], limit, offset, manifest.dataset_version);
  }

  async getIngredient(idOrName: string): Promise<Ingredient | null> {
    const row = await this.database.prepare("SELECT DISTINCT i.json FROM ingredients i LEFT JOIN ingredient_aliases ia ON ia.ingredient_id = i.id WHERE i.id = ? OR i.normalized_name = ? OR ia.normalized_alias = ? ORDER BY CASE WHEN i.id = ? THEN 0 ELSE 1 END, i.id LIMIT 1")
      .bind(idOrName, normalize(idOrName), normalize(idOrName), idOrName).first<JsonRow>();
    return row ? parseJson<Ingredient>(row.json) : null;
  }

  async getRecipesByIds(ids: string[]): Promise<Recipe[]> {
    if (!ids.length) return [];
    const placeholders = ids.map(() => "?").join(",");
    const result = await this.database.prepare(`SELECT json FROM recipes WHERE id IN (${placeholders}) ORDER BY title COLLATE NOCASE`).bind(...ids).all<JsonRow>();
    return result.results.map((row) => parseJson<Recipe>(row.json));
  }

  async findAvailability(ingredientId: string): Promise<AvailabilityEvidence[]> {
    const result = await this.database.prepare("SELECT json FROM availability_evidence WHERE ingredient_id = ? ORDER BY status = 'listed' DESC, checked_at DESC, retailer_id").bind(ingredientId).all<JsonRow>();
    return result.results.map((row) => parseJson<AvailabilityEvidence>(row.json));
  }

  async findSubstitutions(ingredientId: string, recipeId?: string): Promise<SubstitutionRule[]> {
    const statement = recipeId
      ? this.database.prepare("SELECT json FROM substitution_rules WHERE ingredient_id = ? AND recipe_id = ? ORDER BY id").bind(ingredientId, recipeId)
      : this.database.prepare("SELECT json FROM substitution_rules WHERE ingredient_id = ? ORDER BY recipe_id IS NULL DESC, id").bind(ingredientId);
    const result = await statement.all<JsonRow>();
    return result.results.map((row) => parseJson<SubstitutionRule>(row.json));
  }

  async searchProducts(input: ProductSearch): Promise<Page<PlantProduct>> {
    const manifest = await this.getManifest();
    const offset = decodeCursor(input.cursor, manifest.dataset_version);
    const where: string[] = [];
    const values: unknown[] = [];
    if (input.query) { where.push("p.normalized_name LIKE ?"); values.push(`%${normalize(input.query)}%`); }
    if (input.brand) { where.push("lower(p.brand) LIKE ?"); values.push(`%${input.brand.toLowerCase()}%`); }
    if (input.category) { where.push("p.category_id = ?"); values.push(input.category); }
    if (input.retailer) {
      where.push("EXISTS (SELECT 1 FROM plant_product_offers o WHERE o.product_id = p.id AND o.retailer_id = ?)");
      values.push(input.retailer);
    }
    if (input.inStockOnly) where.push("EXISTS (SELECT 1 FROM plant_product_offers o WHERE o.product_id = p.id AND o.availability = 'in_stock')");
    const sql = `SELECT p.json FROM plant_products p ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY p.name COLLATE NOCASE, p.id LIMIT ? OFFSET ?`;
    return this.page<PlantProduct>(sql, values, input.limit, offset, manifest.dataset_version);
  }

  async getNutrients(): Promise<Nutrient[]> {
    const result = await this.database.prepare("SELECT json FROM nutrients ORDER BY label COLLATE NOCASE").all<JsonRow>();
    return result.results.map((row) => parseJson<Nutrient>(row.json));
  }

  async getRetailers(ids?: string[]): Promise<Retailer[]> {
    if (!ids?.length) {
      const result = await this.database.prepare("SELECT json FROM retailers ORDER BY label COLLATE NOCASE").all<JsonRow>();
      return result.results.map((row) => parseJson<Retailer>(row.json));
    }
    const placeholders = ids.map(() => "?").join(",");
    const result = await this.database.prepare(`SELECT json FROM retailers WHERE id IN (${placeholders}) ORDER BY label COLLATE NOCASE`).bind(...ids).all<JsonRow>();
    return result.results.map((row) => parseJson<Retailer>(row.json));
  }

  async getSources(ids?: string[]): Promise<SourceReference[]> {
    if (!ids?.length) {
      const result = await this.database.prepare("SELECT json FROM source_references ORDER BY id").all<JsonRow>();
      return result.results.map((row) => parseJson<SourceReference>(row.json));
    }
    const placeholders = ids.map(() => "?").join(",");
    const result = await this.database.prepare(`SELECT json FROM source_references WHERE id IN (${placeholders}) ORDER BY id`).bind(...ids).all<JsonRow>();
    return result.results.map((row) => parseJson<SourceReference>(row.json));
  }

  async getRecord(entity: PublicEntity, id: string): Promise<import("./contracts.js").JsonObject | null> {
    const tables: Record<PublicEntity, string> = {
      recipe: "recipes",
      ingredient: "ingredients",
      nutrient: "nutrients",
      retailer: "retailers",
      "availability-evidence": "availability_evidence",
      "substitution-rule": "substitution_rules",
      "plant-product": "plant_products",
      "source-reference": "source_references",
    };
    const row = await this.database.prepare(`SELECT json FROM ${tables[entity]} WHERE id = ? LIMIT 1`).bind(id).first<JsonRow>();
    return row ? parseJson<import("./contracts.js").JsonObject>(row.json) : null;
  }
}

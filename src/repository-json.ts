import type {
  AvailabilityEvidence,
  CatalogRepository,
  Ingredient,
  Nutrient,
  Page,
  PlantProduct,
  ProductSearch,
  PublicEntity,
  PublicCatalog,
  PublicManifest,
  Recipe,
  RecipeSearch,
  Retailer,
  SourceReference,
  SubstitutionRule,
} from "./contracts.js";
import { decodeCursor, normalize, paginate } from "./utils.js";

export class JsonCatalogRepository implements CatalogRepository {
  constructor(private readonly catalog: PublicCatalog, private readonly manifest: PublicManifest) {}

  async getManifest(): Promise<PublicManifest> { return this.manifest; }

  async searchRecipes(input: RecipeSearch): Promise<Page<Recipe>> {
    const offset = decodeCursor(input.cursor, this.catalog.dataset_version);
    const query = normalize(input.query ?? "");
    const ingredientQueries = (input.ingredients ?? []).map(normalize).filter(Boolean);
    const meal = normalize(input.meal ?? "");
    let items = this.catalog.recipes.filter((recipe) => {
      const haystack = normalize([recipe.title, recipe.subtitle ?? "", ...recipe.ingredients.map((item) => item.name)].join(" "));
      if (query && !haystack.includes(query)) return false;
      if (meal && !normalize(recipe.meal ?? "").includes(meal)) return false;
      if (input.maxTimeMinutes !== undefined && (recipe.prep_minutes === null || recipe.prep_minutes === undefined || recipe.prep_minutes > input.maxTimeMinutes)) return false;
      if (ingredientQueries.some((needle) => !recipe.ingredients.some((item) => normalize(item.name).includes(needle)))) return false;
      if (input.nutrient) {
        const nutrient = (recipe.nutrition?.priority_scores as Array<Record<string, unknown>> | undefined)?.find((item) => item.key === input.nutrient);
        if (!nutrient || nutrient.status === "unproven") return false;
        if (input.nutrientMinimum !== undefined && (typeof nutrient.amount_per_serving_min !== "number" || nutrient.amount_per_serving_min < input.nutrientMinimum)) return false;
      }
      return true;
    });
    items = items.sort((a, b) => a.title.localeCompare(b.title, "fr") || a.id.localeCompare(b.id));
    return paginate(items, offset, input.limit, this.catalog.dataset_version);
  }

  async getRecipe(idOrSlug: string): Promise<Recipe | null> {
    const needle = normalize(idOrSlug);
    return this.catalog.recipes.find((item) => item.id === idOrSlug || item.slug === idOrSlug || normalize(item.title) === needle) ?? null;
  }

  async searchIngredients(query: string | undefined, limit: number, cursor?: string): Promise<Page<Ingredient>> {
    const offset = decodeCursor(cursor, this.catalog.dataset_version);
    const needle = normalize(query ?? "");
    const items = this.catalog.ingredients
      .filter((item) => !needle || [item.name, ...item.aliases].some((value) => normalize(value).includes(needle)))
      .sort((a, b) => a.name.localeCompare(b.name, "fr") || a.id.localeCompare(b.id));
    return paginate(items, offset, limit, this.catalog.dataset_version);
  }

  async getIngredient(idOrName: string): Promise<Ingredient | null> {
    const needle = normalize(idOrName);
    return this.catalog.ingredients.find((item) => item.id === idOrName)
      ?? this.catalog.ingredients.find((item) => normalize(item.name) === needle || item.aliases.some((alias) => normalize(alias) === needle))
      ?? null;
  }

  async getRecipesByIds(ids: string[]): Promise<Recipe[]> {
    const wanted = new Set(ids);
    return this.catalog.recipes.filter((item) => wanted.has(item.id));
  }

  async findAvailability(ingredientId: string): Promise<AvailabilityEvidence[]> {
    return this.catalog.availability_evidence.filter((item) => item.ingredient_id === ingredientId);
  }

  async findSubstitutions(ingredientId: string, recipeId?: string): Promise<SubstitutionRule[]> {
    return this.catalog.substitution_rules.filter((item) => item.ingredient_id === ingredientId && (!recipeId || item.recipe_id === recipeId));
  }

  async searchProducts(input: ProductSearch): Promise<Page<PlantProduct>> {
    const offset = decodeCursor(input.cursor, this.catalog.dataset_version);
    const query = normalize(input.query ?? "");
    const brand = normalize(input.brand ?? "");
    const items = this.catalog.plant_products
      .filter((item) => !query || normalize(`${item.name} ${item.brand ?? ""}`).includes(query))
      .filter((item) => !brand || normalize(item.brand ?? "").includes(brand))
      .filter((item) => !input.category || item.category_id === input.category)
      .filter((item) => !input.retailer || item.offers.some((offer) => offer.retailer_id === input.retailer))
      .filter((item) => !input.inStockOnly || item.offers.some((offer) => offer.availability === "in_stock"))
      .sort((a, b) => a.name.localeCompare(b.name, "fr") || a.id.localeCompare(b.id));
    return paginate(items, offset, input.limit, this.catalog.dataset_version);
  }

  async getNutrients(): Promise<Nutrient[]> { return this.catalog.nutrients; }

  async getRetailers(ids?: string[]): Promise<Retailer[]> {
    if (!ids?.length) return this.catalog.retailers;
    const wanted = new Set(ids);
    return this.catalog.retailers.filter((item) => wanted.has(item.id));
  }

  async getSources(ids?: string[]): Promise<SourceReference[]> {
    if (!ids?.length) return this.catalog.source_references;
    const wanted = new Set(ids);
    return this.catalog.source_references.filter((item) => wanted.has(item.id));
  }

  async getRecord(entity: PublicEntity, id: string): Promise<import("./contracts.js").JsonObject | null> {
    const collections = {
      recipe: this.catalog.recipes,
      ingredient: this.catalog.ingredients,
      nutrient: this.catalog.nutrients,
      retailer: this.catalog.retailers,
      "availability-evidence": this.catalog.availability_evidence,
      "substitution-rule": this.catalog.substitution_rules,
      "plant-product": this.catalog.plant_products,
      "source-reference": this.catalog.source_references,
    } satisfies Record<PublicEntity, Array<{ id: string }>>;
    return collections[entity].find((item) => item.id === id) ?? null;
  }
}

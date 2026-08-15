export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject { [key: string]: JsonValue | undefined }

export interface PublicCatalog {
  schema_version: string;
  dataset_version: string;
  generated_at: string;
  checked_at: string;
  locale: string;
  geographic_scope: string;
  coverage_warnings: string[];
  recipes: Recipe[];
  ingredients: Ingredient[];
  nutrients: Nutrient[];
  retailers: Retailer[];
  availability_evidence: AvailabilityEvidence[];
  substitution_rules: SubstitutionRule[];
  plant_products: PlantProduct[];
  plant_product_categories: JsonObject[];
  source_references: SourceReference[];
  [key: string]: JsonValue | undefined;
}

export interface PublicManifest extends JsonObject {
  schema_version: string;
  dataset_version: string;
  generated_at: string;
  checked_at: string;
  counts: Record<string, number>;
  coverage: JsonObject;
  warnings: string[];
}

export interface Recipe extends JsonObject {
  id: string;
  slug: string;
  url?: string | null;
  title: string;
  subtitle?: string | null;
  meal?: string | null;
  prep_minutes?: number | null;
  servings?: string | null;
  image_url?: string | null;
  ingredients: RecipeIngredient[];
  guide?: JsonObject | null;
  nutrition?: JsonObject;
}

export interface RecipeIngredient extends JsonObject {
  ingredient_id: string;
  name: string;
  amount?: string | null;
}

export interface Ingredient extends JsonObject {
  id: string;
  name: string;
  aliases: string[];
  recipe_ids: string[];
  marketplace_target_id?: string | null;
  substitution_status: "substitutable" | "sans_substitut_pertinent" | "non_applicable";
  nutrition_basis?: string | null;
  nutrition_summary_per_100g?: Record<string, NutrientMeasurement> | null;
  nutrition_compositions?: JsonObject[];
}

export interface NutrientMeasurement extends JsonObject {
  min: number;
  max: number;
  unit: string;
  method: string;
}

export interface Nutrient extends JsonObject {
  id: string;
  label: string;
  unit: string;
}

export interface Retailer extends JsonObject {
  id: string;
  label: string;
}

export interface AvailabilityEvidence extends JsonObject {
  id: string;
  ingredient_id: string;
  retailer_id: string;
  target_id: string;
  status: string;
  checked_at?: string | null;
}

export interface SubstitutionRule extends JsonObject {
  id: string;
  kind: string;
  ingredient_id: string;
  replacement_ingredient_id: string;
  replacement_name: string;
  recipe_id?: string | null;
  source_id?: string | null;
}

export interface PlantProduct extends JsonObject {
  id: string;
  name: string;
  brand?: string | null;
  category_id?: string | null;
  gtin?: string | null;
  image_url?: string | null;
  last_seen_at?: string | null;
  nutrition?: JsonObject | null;
  offers: JsonObject[];
}

export interface SourceReference extends JsonObject {
  id: string;
  label: string;
  url: string;
  license?: string | null;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface PublicResponse<T extends JsonValue = JsonValue> extends JsonObject {
  dataset_version: string;
  data: T;
  next_cursor: string | null;
  sources: SourceReference[];
  coverage_warnings: string[];
  checked_at: string;
}

export interface RecipeSearch {
  query?: string;
  ingredients?: string[];
  meal?: string;
  maxTimeMinutes?: number;
  nutrient?: string;
  nutrientMinimum?: number;
  limit: number;
  cursor?: string;
}

export interface ProductSearch {
  query?: string;
  brand?: string;
  category?: string;
  retailer?: string;
  inStockOnly?: boolean;
  limit: number;
  cursor?: string;
}

export type PublicEntity =
  | "recipe"
  | "ingredient"
  | "nutrient"
  | "retailer"
  | "availability-evidence"
  | "substitution-rule"
  | "plant-product"
  | "source-reference";

export interface CatalogRepository {
  getManifest(): Promise<PublicManifest>;
  searchRecipes(input: RecipeSearch): Promise<Page<Recipe>>;
  getRecipe(idOrSlug: string): Promise<Recipe | null>;
  searchIngredients(query: string | undefined, limit: number, cursor?: string): Promise<Page<Ingredient>>;
  getIngredient(idOrName: string): Promise<Ingredient | null>;
  getRecipesByIds(ids: string[]): Promise<Recipe[]>;
  findAvailability(ingredientId: string): Promise<AvailabilityEvidence[]>;
  findSubstitutions(ingredientId: string, recipeId?: string): Promise<SubstitutionRule[]>;
  searchProducts(input: ProductSearch): Promise<Page<PlantProduct>>;
  getNutrients(): Promise<Nutrient[]>;
  getRetailers(ids?: string[]): Promise<Retailer[]>;
  getSources(ids?: string[]): Promise<SourceReference[]>;
  getRecord(entity: PublicEntity, id: string): Promise<JsonObject | null>;
}

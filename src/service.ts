import type {
  CatalogRepository,
  Ingredient,
  JsonObject,
  JsonValue,
  PlantProduct,
  PublicManifest,
  PublicEntity,
  PublicResponse,
  Recipe,
  SourceReference,
} from "./contracts.js";
import { PublicDataError } from "./errors.js";
import { clampLimit, decodeCursor, normalize, paginate, unique } from "./utils.js";

const SOURCE_RECIPES = "source:agentvegan-public-recipes";
const SOURCE_MARKETPLACE = "source:agentvegan-public-marketplace";
const SOURCE_SUBSTITUTIONS = "source:agentvegan-public-availability-variants";
const PUBLIC_ENTITIES = new Set<PublicEntity>([
  "recipe",
  "ingredient",
  "nutrient",
  "retailer",
  "availability-evidence",
  "substitution-rule",
  "plant-product",
  "source-reference",
]);

function publicRecipeImage(value: unknown, context: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new PublicDataError("DATASET_UNAVAILABLE", `Image publique manquante pour ${context}.`, 503);
  }
  let url: URL;
  try {
    url = new URL(value, "https://agentvegan.org");
  } catch {
    throw new PublicDataError("DATASET_UNAVAILABLE", `URL d’image invalide pour ${context}.`, 503);
  }
  if (url.protocol !== "https:" || url.origin !== "https://agentvegan.org") {
    throw new PublicDataError("DATASET_UNAVAILABLE", `L’image de ${context} ne provient pas du domaine public AgentVegan.`, 503);
  }
  return url.href;
}

function recipeWithPublicMedia(recipe: Recipe): Recipe {
  const guide = recipe.guide && typeof recipe.guide === "object" && !Array.isArray(recipe.guide)
    ? recipe.guide
    : null;
  if (!guide || !Array.isArray(guide.steps) || !guide.steps.length) {
    throw new PublicDataError("DATASET_UNAVAILABLE", `Le guide de la recette ${recipe.id} est absent ou vide.`, 503);
  }
  const steps = guide.steps.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new PublicDataError("DATASET_UNAVAILABLE", `L’étape ${index + 1} de ${recipe.id} est invalide.`, 503);
    }
    const step = candidate as JsonObject;
    const instruction = typeof step.beginner_instruction === "string" && step.beginner_instruction.trim()
      ? step.beginner_instruction
      : typeof step.short_instruction === "string" && step.short_instruction.trim()
        ? step.short_instruction
        : null;
    if (!instruction) {
      throw new PublicDataError("DATASET_UNAVAILABLE", `L’étape ${index + 1} de ${recipe.id} ne contient aucune instruction publique.`, 503);
    }
    if (typeof step.image_alt !== "string" || !step.image_alt.trim()) {
      throw new PublicDataError("DATASET_UNAVAILABLE", `L’étape ${index + 1} de ${recipe.id} ne contient aucun texte alternatif public.`, 503);
    }
    if (typeof step.duration_minutes !== "number" || !Number.isFinite(step.duration_minutes) || step.duration_minutes < 0) {
      throw new PublicDataError("DATASET_UNAVAILABLE", `L’étape ${index + 1} de ${recipe.id} ne contient aucune durée publique valide.`, 503);
    }
    return {
      ...step,
      image: publicRecipeImage(step.image, `l’étape ${index + 1} de ${recipe.id}`),
    };
  });
  if (recipe.nutrition?.basis !== "par_portion" || !Array.isArray(recipe.nutrition.priority_scores) || recipe.nutrition.priority_scores.length < 16) {
    throw new PublicDataError("DATASET_UNAVAILABLE", `La nutrition par portion de ${recipe.id} est absente ou incomplète.`, 503);
  }
  return {
    ...recipe,
    image_url: publicRecipeImage(recipe.image_url, `la recette ${recipe.id}`),
    servings_count: numericServings(recipe.servings),
    step_count: steps.length,
    guide: { ...guide, steps },
  };
}

function recipeSummary(source: Recipe): JsonObject {
  const recipe = recipeWithPublicMedia(source);
  return {
    id: recipe.id,
    slug: recipe.slug,
    title: recipe.title,
    subtitle: recipe.subtitle ?? null,
    meal: recipe.meal ?? null,
    prep_minutes: recipe.prep_minutes ?? null,
    servings: recipe.servings ?? null,
    servings_count: recipe.servings_count ?? null,
    step_count: recipe.step_count ?? null,
    image_url: recipe.image_url ?? null,
    url: recipe.url,
    ingredients: recipe.ingredients.map((item) => ({
      ingredient_id: item.ingredient_id,
      name: item.name,
      amount: item.amount ?? null,
    })),
    nutrition_basis: recipe.nutrition?.basis ?? null,
    nutrition: recipe.nutrition?.priority_scores ?? [],
  };
}

function ingredientSummary(ingredient: Ingredient): JsonObject {
  return {
    id: ingredient.id,
    name: ingredient.name,
    aliases: ingredient.aliases,
    roles: ingredient.roles ?? [],
    occurrence_count: ingredient.occurrence_count ?? 0,
    substitution_status: ingredient.substitution_status,
    nutrition_basis: ingredient.nutrition_basis ?? null,
    nutrition_summary_per_100g: ingredient.nutrition_summary_per_100g ?? null,
  };
}

function productSummary(product: PlantProduct): JsonObject {
  return {
    id: product.id,
    name: product.name,
    brand: product.brand ?? null,
    category_id: product.category_id ?? null,
    image_url: product.image_url ?? null,
    last_seen_at: product.last_seen_at ?? null,
    offers: product.offers,
  };
}

function sourceIdsIn(value: unknown, output = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) sourceIdsIn(item, output);
    return output;
  }
  if (!value || typeof value !== "object") return output;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if ((key === "source_id" || key === "declared_source_id") && typeof child === "string") output.add(child);
    if ((key === "source_ids" || key.endsWith("_source_ids")) && Array.isArray(child)) {
      for (const id of child) if (typeof id === "string") output.add(id);
    }
    sourceIdsIn(child, output);
  }
  return output;
}

function numericServings(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.match(/^\s*(\d+(?:[.,]\d+)?)/u)
    ?? value.match(/\b(?:portions?|personnes?)\s*[:=]?\s*(\d+(?:[.,]\d+)?)/iu);
  if (!match?.[1]) return null;
  const amount = Number(match[1].replace(",", "."));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export class PublicDataService {
  constructor(
    private readonly repository: CatalogRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly maximumDatasetAgeDays = 45,
    private readonly maximumEvidenceAgeDays = 30,
  ) {}

  private async manifest(allowStale = false): Promise<PublicManifest> {
    const manifest = await this.repository.getManifest();
    const checkedAt = Date.parse(manifest.checked_at);
    if (!Number.isFinite(checkedAt)) {
      throw new PublicDataError("DATASET_UNAVAILABLE", "Le manifeste ne contient pas de date checked_at valide.", 503);
    }
    const ageDays = (this.now().getTime() - checkedAt) / 86_400_000;
    if (!allowStale && ageDays > this.maximumDatasetAgeDays) {
      throw new PublicDataError("DATASET_STALE", `Le catalogue n’a pas été vérifié depuis ${Math.floor(ageDays)} jours (maximum ${this.maximumDatasetAgeDays}).`, 503, {
        checked_at: manifest.checked_at,
        maximum_age_days: this.maximumDatasetAgeDays,
      });
    }
    return manifest;
  }

  private async envelope<T extends JsonValue>(data: T, nextCursor: string | null, warnings: string[], explicitSourceIds: string[] = []): Promise<PublicResponse<T>> {
    const manifest = await this.manifest();
    const ids = unique([...explicitSourceIds, ...sourceIdsIn(data)]);
    const sources = await this.repository.getSources(ids);
    return {
      dataset_version: manifest.dataset_version,
      data,
      next_cursor: nextCursor,
      sources,
      coverage_warnings: unique(warnings),
      checked_at: manifest.checked_at,
    };
  }

  private async resolveIngredient(value: string): Promise<Ingredient> {
    if (!value.trim()) throw new PublicDataError("INVALID_ARGUMENT", "Un identifiant ou nom d’ingrédient est requis.", 400);
    if (value.startsWith("ingredient-")) {
      const byId = await this.repository.getIngredient(value);
      if (!byId) throw new PublicDataError("NOT_FOUND", `Ingrédient introuvable : ${value}.`, 404);
      return byId;
    }
    const candidates = (await this.repository.searchIngredients(value, 50)).items;
    const needle = normalize(value);
    const exactNames = candidates.filter((item) => normalize(item.name) === needle);
    if (exactNames.length === 1 && exactNames[0]) return exactNames[0];
    const exactAliases = candidates.filter((item) => item.aliases.some((alias) => normalize(alias) === needle));
    if (exactAliases.length === 1 && exactAliases[0]) return exactAliases[0];
    if (exactNames.length > 1 || exactAliases.length > 1 || candidates.length > 1) {
      const ambiguous = exactNames.length > 1 ? exactNames : exactAliases.length > 1 ? exactAliases : candidates;
      const choices = ambiguous.slice(0, 10).map((item) => ({ id: item.id, name: item.name }));
      throw new PublicDataError("AMBIGUOUS_INGREDIENT", `« ${value} » correspond à plusieurs ingrédients. Utilisez un identifiant stable.`, 409, { choices });
    }
    if (candidates.length === 1 && candidates[0]) return candidates[0];
    throw new PublicDataError("NOT_FOUND", `Ingrédient introuvable : ${value}.`, 404);
  }

  async searchRecipes(input: {
    query?: string | undefined;
    ingredients?: string[] | undefined;
    meal?: string | undefined;
    max_time_minutes?: number | undefined;
    nutrient?: string | undefined;
    nutrient_minimum?: number | undefined;
    limit?: number | undefined;
    cursor?: string | undefined;
  }): Promise<PublicResponse> {
    await this.manifest();
    const limit = clampLimit(input.limit);
    if (input.max_time_minutes !== undefined && (!Number.isFinite(input.max_time_minutes) || input.max_time_minutes < 0)) {
      throw new PublicDataError("INVALID_ARGUMENT", "max_time_minutes doit être un nombre positif.", 400);
    }
    if (input.nutrient_minimum !== undefined && !input.nutrient) {
      throw new PublicDataError("INVALID_ARGUMENT", "nutrient_minimum nécessite le paramètre nutrient.", 400);
    }
    if (input.nutrient) {
      const nutrients = await this.repository.getNutrients();
      if (!nutrients.some((item) => item.id === input.nutrient)) {
        throw new PublicDataError("INVALID_ARGUMENT", `Nutriment inconnu : ${input.nutrient}.`, 400, { allowed: nutrients.map((item) => item.id) });
      }
    }
    const page = await this.repository.searchRecipes({
      ...(input.query ? { query: input.query } : {}),
      ...(input.ingredients ? { ingredients: input.ingredients } : {}),
      ...(input.meal ? { meal: input.meal } : {}),
      ...(input.max_time_minutes !== undefined ? { maxTimeMinutes: input.max_time_minutes } : {}),
      ...(input.nutrient ? { nutrient: input.nutrient } : {}),
      ...(input.nutrient_minimum !== undefined ? { nutrientMinimum: input.nutrient_minimum } : {}),
      limit,
      ...(input.cursor ? { cursor: input.cursor } : {}),
    });
    return this.envelope(page.items.map(recipeSummary), page.nextCursor, [], [SOURCE_RECIPES]);
  }

  async getRecipe(id: string): Promise<PublicResponse> {
    await this.manifest();
    const recipe = await this.repository.getRecipe(id);
    if (!recipe) throw new PublicDataError("NOT_FOUND", `Recette introuvable : ${id}.`, 404);
    const publicRecipe = recipeWithPublicMedia(recipe);
    const warnings = (publicRecipe.nutrition?.priority_scores as Array<Record<string, unknown>> | undefined)?.some((item) => item.status === "sourced_lower_bound")
      ? ["Certaines valeurs nutritionnelles sont des minimums sourcés et restent explicitement marquées comme telles."]
      : [];
    return this.envelope(publicRecipe, null, warnings, [SOURCE_RECIPES]);
  }

  async searchIngredients(input: { query?: string | undefined; limit?: number | undefined; cursor?: string | undefined }): Promise<PublicResponse> {
    const limit = clampLimit(input.limit);
    const page = await this.repository.searchIngredients(input.query, limit, input.cursor);
    return this.envelope(page.items.map(ingredientSummary), page.nextCursor, [], [SOURCE_RECIPES]);
  }

  async getIngredient(id: string): Promise<PublicResponse> {
    const ingredient = await this.resolveIngredient(id);
    const recipes = await this.repository.getRecipesByIds(ingredient.recipe_ids);
    const data: JsonObject = { ...ingredient, recipes: recipes.map(recipeSummary) };
    const warnings = ingredient.nutrition_summary_per_100g
      ? []
      : ["Aucune composition nutritionnelle officielle n’est reliée à cet ingrédient dans cette version."];
    return this.envelope(data, null, warnings, [SOURCE_RECIPES]);
  }

  async findStoresForIngredient(input: { ingredient: string; retailer?: string | undefined; status?: string | undefined; limit?: number | undefined; cursor?: string | undefined }): Promise<PublicResponse> {
    const manifest = await this.manifest();
    const ingredient = await this.resolveIngredient(input.ingredient);
    const limit = clampLimit(input.limit);
    const offset = decodeCursor(input.cursor, manifest.dataset_version);
    let evidence = await this.repository.findAvailability(ingredient.id);
    if (input.retailer) evidence = evidence.filter((item) => item.retailer_id === input.retailer);
    if (input.status) evidence = evidence.filter((item) => item.status === input.status);
    const statusRank: Record<string, number> = { listed: 5, unavailable: 4, unknown: 3, not_found: 2, not_applicable: 1 };
    const byRetailer = new Map<string, typeof evidence>();
    for (const item of evidence) {
      const group = byRetailer.get(item.retailer_id) ?? [];
      group.push(item);
      byRetailer.set(item.retailer_id, group);
    }
    const consolidated = [...byRetailer.values()].map((group) => {
      const ranked = [...group].sort((left, right) => (
        (statusRank[right.status] ?? 0) - (statusRank[left.status] ?? 0)
        || Date.parse(right.checked_at ?? "") - Date.parse(left.checked_at ?? "")
        || left.id.localeCompare(right.id)
      ));
      const primary = ranked[0];
      if (!primary) throw new PublicDataError("DATASET_UNAVAILABLE", "Groupe de preuves vide dans le catalogue.", 503);
      return {
        ...primary,
        alternate_evidence_ids: ranked.slice(1).map((item) => item.id),
      };
    }).sort((left, right) => (
      (statusRank[right.status] ?? 0) - (statusRank[left.status] ?? 0)
      || left.retailer_id.localeCompare(right.retailer_id)
    ));
    const page = paginate(consolidated, offset, limit, manifest.dataset_version);
    const retailers = await this.repository.getRetailers(unique(page.items.map((item) => item.retailer_id)));
    const retailerById = new Map(retailers.map((item) => [item.id, item]));
    const items = page.items.map((item) => ({ ...item, retailer: retailerById.get(item.retailer_id) ?? null }));
    const staleCount = page.items.filter((item) => !item.checked_at || (this.now().getTime() - Date.parse(item.checked_at)) / 86_400_000 > this.maximumEvidenceAgeDays).length;
    const warnings = ["La disponibilité est une preuve datée dans un périmètre donné, jamais une promesse de stock actuel."];
    if (staleCount) warnings.push(`${staleCount} preuve(s) de cette page dépassent ${this.maximumEvidenceAgeDays} jours ou n’ont pas de date exploitable.`);
    return this.envelope({ ingredient: ingredientSummary(ingredient), evidence: items }, page.nextCursor, warnings, [SOURCE_MARKETPLACE]);
  }

  async findSubstitutes(input: { ingredient: string; recipe_id?: string | undefined; limit?: number | undefined; cursor?: string | undefined }): Promise<PublicResponse> {
    const manifest = await this.manifest();
    const ingredient = await this.resolveIngredient(input.ingredient);
    const rules = await this.repository.findSubstitutions(ingredient.id, input.recipe_id);
    const limit = clampLimit(input.limit);
    const offset = decodeCursor(input.cursor, manifest.dataset_version);
    const page = paginate(rules, offset, limit, manifest.dataset_version);
    const warnings = rules.length ? [] : [ingredient.substitution_classification_basis as string ?? "Aucune substitution publique validée n’est disponible pour cet ingrédient."];
    const adaptationSource = rules.some((rule) => rule.kind === "adaptation_de_recette") ? [SOURCE_SUBSTITUTIONS] : [];
    return this.envelope({ ingredient: ingredientSummary(ingredient), substitutions: page.items }, page.nextCursor, warnings, adaptationSource);
  }

  async searchPlantProducts(input: {
    query?: string | undefined;
    brand?: string | undefined;
    category?: string | undefined;
    retailer?: string | undefined;
    in_stock_only?: boolean | undefined;
    limit?: number | undefined;
    cursor?: string | undefined;
  }): Promise<PublicResponse> {
    const page = await this.repository.searchProducts({
      ...(input.query ? { query: input.query } : {}),
      ...(input.brand ? { brand: input.brand } : {}),
      ...(input.category ? { category: input.category } : {}),
      ...(input.retailer ? { retailer: input.retailer } : {}),
      ...(input.in_stock_only !== undefined ? { inStockOnly: input.in_stock_only } : {}),
      limit: clampLimit(input.limit),
      ...(input.cursor ? { cursor: input.cursor } : {}),
    });
    return this.envelope(page.items.map(productSummary), page.nextCursor, ["Le recensement des produits végétaux est en cours et les offres restent datées."], [SOURCE_MARKETPLACE]);
  }

  async compareNutrition(input: { entities: string[]; basis: "100_g" | "portion" | "recette" }): Promise<PublicResponse> {
    if (input.entities.length < 2 || input.entities.length > 10) {
      throw new PublicDataError("INVALID_ARGUMENT", "entities doit contenir entre 2 et 10 identifiants ou noms.", 400);
    }
    const comparisons: JsonObject[] = [];
    for (const identifier of input.entities) {
      let ingredient: Ingredient | null = null;
      try {
        ingredient = await this.resolveIngredient(identifier);
      } catch (error) {
        if (!(error instanceof PublicDataError) || error.code !== "NOT_FOUND") throw error;
      }
      if (ingredient) {
        if (input.basis !== "100_g") {
          throw new PublicDataError("UNSUPPORTED_BASIS", `L’ingrédient ${ingredient.name} n’est comparable que sur la base 100_g.`, 400);
        }
        if (!ingredient.nutrition_summary_per_100g) {
          throw new PublicDataError("NOT_FOUND", `Aucune composition officielle n’est disponible pour ${ingredient.name}.`, 404);
        }
        comparisons.push({ entity_type: "ingredient", id: ingredient.id, name: ingredient.name, basis: "100_g", nutrients: ingredient.nutrition_summary_per_100g });
        continue;
      }
      const recipe = await this.repository.getRecipe(identifier);
      if (!recipe) throw new PublicDataError("NOT_FOUND", `Entité nutritionnelle introuvable : ${identifier}.`, 404);
      if (input.basis === "100_g") {
        throw new PublicDataError("UNSUPPORTED_BASIS", `La recette ${recipe.title} ne possède pas de base 100_g démontrée.`, 400);
      }
      const scores = recipe.nutrition?.priority_scores as Array<Record<string, unknown>> | undefined;
      if (!scores?.length) throw new PublicDataError("NOT_FOUND", `Aucune nutrition chiffrée n’est disponible pour ${recipe.title}.`, 404);
      const multiplier = input.basis === "recette" ? numericServings(recipe.servings) : 1;
      if (multiplier === null) {
        throw new PublicDataError("UNSUPPORTED_BASIS", `Le nombre de portions de ${recipe.title} n’est pas convertible de façon fiable.`, 400);
      }
      const nutrients = scores
        .filter((item) => item.status !== "unproven" && typeof item.amount_per_serving_min === "number" && typeof item.amount_per_serving_max === "number")
        .map((item) => ({
          id: typeof item.key === "string" ? item.key : "",
          label: typeof item.label === "string" ? item.label : "",
          unit: typeof item.unit === "string" ? item.unit : "",
          min: (item.amount_per_serving_min as number) * multiplier,
          max: (item.amount_per_serving_max as number) * multiplier,
          status: typeof item.status === "string" ? item.status : "unknown",
          method: input.basis === "recette" ? "valeur_par_portion_multipliée_par_le_nombre_de_portions_déclaré" : "valeur_par_portion_sourcée",
        }));
      comparisons.push({ entity_type: "recipe", id: recipe.id, name: recipe.title, basis: input.basis, nutrients });
    }
    return this.envelope({ basis: input.basis, comparisons }, null, ["Les valeurs nutritionnelles ne remplacent pas un avis médical."], [SOURCE_RECIPES]);
  }

  async getEntityRecord(entity: PublicEntity, id: string): Promise<PublicResponse> {
    if (!PUBLIC_ENTITIES.has(entity)) {
      throw new PublicDataError("INVALID_ARGUMENT", `Type d’entité inconnu : ${entity}.`, 400, { allowed: [...PUBLIC_ENTITIES] });
    }
    const record = await this.repository.getRecord(entity, id);
    if (!record) throw new PublicDataError("NOT_FOUND", `Fiche ${entity} introuvable : ${id}.`, 404);
    const sourceIds = entity === "recipe" || entity === "ingredient"
      ? [SOURCE_RECIPES]
      : entity === "availability-evidence" || entity === "plant-product"
        ? [SOURCE_MARKETPLACE]
        : entity === "substitution-rule" && record.kind === "adaptation_de_recette"
          ? [SOURCE_SUBSTITUTIONS]
          : [];
    return this.envelope(record, null, [], sourceIds);
  }

  async getCatalogStatus(): Promise<PublicResponse> {
    const manifest = await this.manifest(true);
    const ageDays = Math.max(0, (this.now().getTime() - Date.parse(manifest.checked_at)) / 86_400_000);
    const state = ageDays > this.maximumDatasetAgeDays ? "stale" : "healthy";
    const sources: SourceReference[] = await this.repository.getSources();
    return {
      dataset_version: manifest.dataset_version,
      data: {
        state,
        age_days: Math.round(ageDays * 10) / 10,
        maximum_age_days: this.maximumDatasetAgeDays,
        manifest,
        limitations: manifest.warnings,
      },
      next_cursor: null,
      sources,
      coverage_warnings: manifest.warnings,
      checked_at: manifest.checked_at,
    };
  }
}

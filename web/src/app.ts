import { App } from "@modelcontextprotocol/ext-apps";
import { z } from "zod";
import "./styles.css";

const IMAGE_ORIGINS = new Set([
  "https://agentvegan.org",
  "https://catalog-media.lafourche.fr",
  "https://cdn.greenweez.com",
  "https://koro.imgix.net",
  "https://media.houra.fr",
  "https://mescoursesenligne.lavieclaire.com",
  "https://nutri-beautiful.com",
  "https://storefront-prod.fr.picnicinternational.com",
  "https://www.biocoop.fr",
  "https://www.etiketbio.eu",
  "https://www.kazidomi.com",
  "https://www.marguerite-and-cow.fr",
  "https://www.monepicerieparis.fr",
  "https://www.officialveganshop.com",
  "https://www.plantbaseddistribution.com.au",
  "https://www.vegetalfood.fr",
  "https://www.vegetalsquare.com",
]);

const OPEN_LINK_ORIGINS = new Set([...IMAGE_ORIGINS, "https://mcp.agentvegan.org"]);
const optionalString = z.string().nullable().optional();
const optionalNumber = z.number().finite().nullable().optional();
const imageUrl = z.string().url().refine((value) => {
  try { return IMAGE_ORIGINS.has(new URL(value).origin); } catch { return false; }
}, "Origine d’image non autorisée").nullable().optional();
const safeLink = z.string().url().refine((value) => {
  try { return new URL(value).protocol === "https:" && OPEN_LINK_ORIGINS.has(new URL(value).origin); } catch { return false; }
}, "Lien externe non autorisé").nullable().optional();

const NutrientScoreSchema = z.object({
  key: z.string(),
  label: z.string(),
  unit: z.string(),
  status: optionalString,
  amount_per_serving_min: optionalNumber,
  amount_per_serving_max: optionalNumber,
}).passthrough();

const RecipeCardSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  subtitle: optionalString,
  meal: optionalString,
  prep_minutes: optionalNumber,
  servings: optionalString,
  image_url: imageUrl,
  url: safeLink,
  nutrition: z.array(NutrientScoreSchema).optional().default([]),
}).passthrough();

const RecipeStepSchema = z.object({
  id: z.string(),
  order: z.number().int().nonnegative(),
  title: z.string(),
  duration_minutes: optionalNumber,
  short_instruction: optionalString,
  beginner_instruction: optionalString,
  completion_check: optionalString,
  image: imageUrl,
  image_alt: optionalString,
}).passthrough();

const RecipeDetailSchema = RecipeCardSchema.extend({
  ingredients: z.array(z.object({
    name: z.string(),
    amount: optionalString,
  }).passthrough()),
  guide: z.object({
    overview: optionalString,
    steps: z.array(RecipeStepSchema),
  }).passthrough().nullable().optional(),
  nutrition: z.object({
    basis: optionalString,
    priority_scores: z.array(NutrientScoreSchema).optional().default([]),
  }).passthrough().nullable().optional(),
}).passthrough();

const OfferSchema = z.object({
  retailer_id: z.string(),
  availability: optionalString,
  checked_at: optionalString,
  product_url: safeLink,
  price_cents: optionalNumber,
  unit_price: optionalString,
}).passthrough();

const ProductCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  brand: optionalString,
  category_id: optionalString,
  image_url: imageUrl,
  last_seen_at: optionalString,
  offers: z.array(OfferSchema).default([]),
}).passthrough();

const ComparisonNutrientSchema = z.object({
  id: z.string(),
  label: z.string(),
  unit: z.string(),
  min: z.number().finite(),
  max: z.number().finite(),
  status: optionalString,
  method: optionalString,
}).passthrough();

const ComparisonSeriesSchema = z.object({
  entity_type: z.enum(["ingredient", "recipe"]),
  id: z.string(),
  name: z.string(),
  basis: z.enum(["100_g", "portion", "recette"]),
  nutrients: z.array(ComparisonNutrientSchema),
}).passthrough();

const IngredientSchema = z.object({
  id: z.string(),
  name: z.string(),
  aliases: z.array(z.string()).default([]),
  roles: z.array(z.string()).optional().default([]),
  substitution_status: z.enum(["substitutable", "sans_substitut_pertinent", "non_applicable"]),
  recipes: z.array(RecipeCardSchema).optional().default([]),
}).passthrough();

const EnvelopeSchema = z.object({
  dataset_version: z.string(),
  data: z.unknown(),
  next_cursor: z.string().nullable(),
  sources: z.array(z.unknown()),
  coverage_warnings: z.array(z.string()),
  checked_at: z.string(),
}).passthrough();

const RecipeGalleryDataSchema = z.object({
  view: z.literal("recipe_gallery"),
  items: z.array(RecipeCardSchema).min(1).max(8),
  search: z.record(z.string(), z.unknown()),
  next_cursor: z.string().nullable(),
}).passthrough();

const RecipeDetailDataSchema = z.object({
  view: z.literal("recipe_detail"),
  recipe: RecipeDetailSchema,
}).passthrough();

const ProductGalleryDataSchema = z.object({
  view: z.literal("plant_product_gallery"),
  items: z.array(ProductCardSchema).min(1).max(8),
  search: z.record(z.string(), z.unknown()),
  next_cursor: z.string().nullable(),
}).passthrough();

const NutritionDataSchema = z.object({
  view: z.literal("nutrition_comparison"),
  basis: z.enum(["100_g", "portion", "recette"]),
  series: z.array(ComparisonSeriesSchema).min(2).max(10),
}).passthrough();

const IngredientDataSchema = z.object({
  view: z.literal("ingredient_explorer"),
  ingredient: IngredientSchema,
}).passthrough();

type Envelope = z.infer<typeof EnvelopeSchema>;
type RecipeCard = z.infer<typeof RecipeCardSchema>;
type RecipeDetail = z.infer<typeof RecipeDetailSchema>;
type ProductCard = z.infer<typeof ProductCardSchema>;
type ComparisonSeries = z.infer<typeof ComparisonSeriesSchema>;
type Ingredient = z.infer<typeof IngredientSchema>;

interface GalleryPage<T> {
  items: T[];
  nextCursor: string | null;
}

interface OpenAiExtensions {
  widgetState?: unknown;
  setWidgetState?: (state: Record<string, unknown>) => Promise<void> | void;
}

declare global {
  interface Window { openai?: OpenAiExtensions; }
}

const rootCandidate = document.querySelector<HTMLElement>("#app");
if (!rootCandidate) throw new Error("Racine AgentVegan introuvable.");
const root: HTMLElement = rootCandidate;

const app = new App(
  { name: "AgentVegan Interactive", version: "1.1.0" },
  { availableDisplayModes: ["inline", "fullscreen"] },
  { autoResize: true, strict: true },
);

let connected = false;
let currentEnvelope: Envelope | null = null;
let savedGallery: (() => void) | null = null;
let recipePages: GalleryPage<RecipeCard>[] = [];
let productPages: GalleryPage<ProductCard>[] = [];
let recipeSearch: Record<string, unknown> = {};
let productSearch: Record<string, unknown> = {};

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function replaceRoot(node: Node): void {
  root.replaceChildren(node);
}

function showError(message: string): void {
  const node = element("p", "error", message);
  node.setAttribute("role", "alert");
  replaceRoot(node);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "date inconnue";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "date invalide";
  const locale = app.getHostContext()?.locale ?? document.documentElement.lang ?? "fr-FR";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}

function formatNumber(value: number, maximumFractionDigits = 1): string {
  const locale = app.getHostContext()?.locale ?? document.documentElement.lang ?? "fr-FR";
  return new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);
}

function normalizeLabel(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function imageMedia(url: string | null | undefined, alt: string): HTMLElement {
  const media = element("div", "card-media");
  if (!url) {
    media.append(element("span", "image-error", "Image non disponible dans le catalogue public."));
    return media;
  }
  const image = element("img");
  image.src = url;
  image.alt = alt;
  image.loading = "lazy";
  image.decoding = "async";
  image.addEventListener("error", () => {
    media.replaceChildren(element("span", "image-error", "L’image source n’est pas accessible actuellement."));
  }, { once: true });
  media.append(image);
  return media;
}

function button(label: string, action: () => void | Promise<void>, variant = ""): HTMLButtonElement {
  const node = element("button", `button ${variant}`.trim(), label);
  node.type = "button";
  node.addEventListener("click", () => void action());
  return node;
}

function shell(title: string, eyebrow: string): { container: HTMLElement; content: HTMLElement; actions: HTMLElement } {
  const container = element("section", "shell");
  const header = element("div", "header-row");
  const copy = element("div");
  copy.append(element("p", "eyebrow", eyebrow), element("h1", "", title));
  const actions = element("div", "actions");
  header.append(copy, actions);
  const content = element("div");
  container.append(header, content);
  return { container, content, actions };
}

function appendEnvelopeFooter(container: HTMLElement, envelope: Envelope): void {
  if (envelope.coverage_warnings.length) {
    const warnings = element("div", "warning");
    for (const warning of envelope.coverage_warnings) warnings.append(element("p", "", warning));
    container.append(warnings);
  }
  container.append(element("p", "meta", `Catalogue ${envelope.dataset_version} · vérifié le ${formatDate(envelope.checked_at)}`));
}

function recipeNutrientChips(recipe: RecipeCard | RecipeDetail, limit = 3): HTMLElement {
  const chips = element("div", "chips");
  const scores = Array.isArray(recipe.nutrition)
    ? recipe.nutrition
    : recipe.nutrition?.priority_scores ?? [];
  for (const score of scores.filter((item) => item.status !== "unproven" && item.amount_per_serving_min !== null && item.amount_per_serving_min !== undefined).slice(0, limit)) {
    const prefix = score.status === "sourced_lower_bound" ? "au moins " : "";
    chips.append(element("span", "chip", `${score.label} ${prefix}${formatNumber(score.amount_per_serving_min ?? 0)} ${score.unit}`));
  }
  return chips;
}

async function callTool(name: string, args: Record<string, unknown>): Promise<Envelope> {
  if (!connected || !app.getHostCapabilities()?.serverTools) {
    throw new Error("Cet hôte n’autorise pas encore l’interface à appeler les outils MCP.");
  }
  const result = await app.callServerTool({ name, arguments: args });
  if (result.isError) {
    const text = result.content?.find((item) => item.type === "text");
    throw new Error(text && "text" in text ? text.text : `L’outil ${name} a échoué.`);
  }
  const parsed = EnvelopeSchema.safeParse(result.structuredContent);
  if (!parsed.success) throw new Error(`La réponse structurée de ${name} ne respecte pas le contrat public.`);
  return parsed.data;
}

async function openExternal(url: string | null | undefined): Promise<void> {
  const parsed = safeLink.safeParse(url);
  if (!parsed.success || !parsed.data) throw new Error("Ce lien externe n’est pas autorisé.");
  if (!app.getHostCapabilities()?.openLinks) throw new Error("Cet hôte ne permet pas d’ouvrir les liens externes depuis l’interface.");
  const result = await app.openLink({ url: parsed.data });
  if (result.isError) throw new Error("L’hôte n’a pas pu ouvrir le lien externe.");
}

async function requestFullscreen(): Promise<void> {
  const context = app.getHostContext();
  if (!context?.availableDisplayModes?.includes("fullscreen")) return;
  await app.requestDisplayMode({ mode: "fullscreen" });
}

function addFullscreenAction(actions: HTMLElement): void {
  if (app.getHostContext()?.availableDisplayModes?.includes("fullscreen")) {
    actions.append(button("Agrandir", requestFullscreen));
  }
}

function persistChatGptState(state: Record<string, unknown>): void {
  const openai = window.openai;
  if (typeof openai?.setWidgetState === "function") {
    void Promise.resolve(openai.setWidgetState(state)).catch(() => undefined);
  }
}

async function showRecipe(recipeId: string): Promise<void> {
  try {
    const envelope = await callTool("get_recipe", { id: recipeId });
    const recipe = RecipeDetailSchema.safeParse(envelope.data);
    if (!recipe.success) throw new Error("La fiche recette reçue est invalide.");
    currentEnvelope = envelope;
    persistChatGptState({ selected_recipe_id: recipeId });
    if (app.getHostCapabilities()?.updateModelContext) {
      await app.updateModelContext({
        content: [{ type: "text", text: `Recette AgentVegan sélectionnée : ${recipe.data.title} (${recipe.data.id}).` }],
        structuredContent: { selected_recipe_id: recipe.data.id, selected_recipe_title: recipe.data.title },
      });
    }
    renderRecipeDetail(recipe.data, envelope);
  } catch (error) {
    showError(error instanceof Error ? error.message : "Impossible d’ouvrir la recette.");
  }
}

function recipeCard(recipe: RecipeCard): HTMLElement {
  const card = element("article", "card");
  card.append(imageMedia(recipe.image_url, `Photo du plat : ${recipe.title}`));
  const body = element("div", "card-body");
  body.append(element("h3", "", recipe.title));
  if (recipe.subtitle) body.append(element("p", "meta", recipe.subtitle));
  const facts = element("div", "chips");
  if (recipe.prep_minutes !== null && recipe.prep_minutes !== undefined) facts.append(element("span", "chip good", `${formatNumber(recipe.prep_minutes, 0)} min`));
  if (recipe.meal) facts.append(element("span", "chip", recipe.meal));
  body.append(facts, recipeNutrientChips(recipe), button("Voir la recette", () => showRecipe(recipe.id), "primary"));
  card.append(body);
  return card;
}

function renderRecipeGalleryPage(pageIndex: number, envelope: Envelope): void {
  const page = recipePages[pageIndex];
  if (!page) return showError("Page de recettes introuvable.");
  const view = shell("Recettes à découvrir", "AgentVegan · recettes illustrées");
  addFullscreenAction(view.actions);
  const carousel = element("div", "carousel");
  carousel.setAttribute("aria-label", "Carrousel de recettes");
  for (const recipe of page.items) carousel.append(recipeCard(recipe));
  view.content.append(carousel);

  const pager = element("div", "pager");
  const previous = button("Page précédente", () => renderRecipeGalleryPage(pageIndex - 1, envelope));
  previous.disabled = pageIndex === 0;
  const next = button("Page suivante", async () => {
    const cached = recipePages[pageIndex + 1];
    if (cached) return renderRecipeGalleryPage(pageIndex + 1, envelope);
    if (!page.nextCursor) return;
    next.disabled = true;
    try {
      const response = await callTool("search_recipes", { ...recipeSearch, limit: 8, cursor: page.nextCursor });
      const items = z.array(RecipeCardSchema).safeParse(response.data);
      if (!items.success || !items.data.length) throw new Error("La page suivante de recettes est vide ou invalide.");
      recipePages.push({ items: items.data, nextCursor: response.next_cursor });
      currentEnvelope = response;
      renderRecipeGalleryPage(pageIndex + 1, response);
    } catch (error) {
      showError(error instanceof Error ? error.message : "Pagination impossible.");
    }
  });
  next.disabled = !page.nextCursor;
  pager.append(previous, element("span", "meta", `Page ${pageIndex + 1}`), next);
  view.content.append(pager);
  appendEnvelopeFooter(view.container, envelope);
  replaceRoot(view.container);
  savedGallery = () => renderRecipeGalleryPage(pageIndex, envelope);
}

function renderRecipeGallery(data: z.infer<typeof RecipeGalleryDataSchema>, envelope: Envelope): void {
  recipeSearch = data.search;
  recipePages = [{ items: data.items, nextCursor: data.next_cursor }];
  renderRecipeGalleryPage(0, envelope);
}

function renderRecipeDetail(recipe: RecipeDetail, envelope: Envelope): void {
  const view = shell(recipe.title, "AgentVegan · fiche recette");
  if (savedGallery) view.actions.append(button("Retour aux recettes", () => savedGallery?.()));
  addFullscreenAction(view.actions);
  const hero = imageMedia(recipe.image_url, `Photo du plat terminé : ${recipe.title}`);
  hero.className = "hero";
  view.content.append(hero);

  const overview = element("div", "detail-grid");
  const ingredients = element("section", "panel");
  ingredients.append(element("h2", "", "Ingrédients"));
  const list = element("ul", "list");
  for (const ingredient of recipe.ingredients) list.append(element("li", "", `${ingredient.amount ? `${ingredient.amount} · ` : ""}${ingredient.name}`));
  ingredients.append(list);
  const nutrition = element("section", "panel");
  nutrition.append(element("h2", "", `Nutrition · ${recipe.nutrition?.basis?.replaceAll("_", " ") ?? "base non précisée"}`));
  const metrics = element("div", "nutrition-grid");
  const scores = recipe.nutrition?.priority_scores ?? [];
  for (const score of scores.filter((item) => item.status !== "unproven" && item.amount_per_serving_min !== null && item.amount_per_serving_min !== undefined).slice(0, 8)) {
    const metric = element("div", "metric");
    metric.append(element("span", "meta", score.label));
    const prefix = score.status === "sourced_lower_bound" ? "au moins " : "";
    metric.append(element("strong", "", `${prefix}${formatNumber(score.amount_per_serving_min ?? 0)} ${score.unit}`));
    metrics.append(metric);
  }
  nutrition.append(metrics);
  overview.append(ingredients, nutrition);
  view.content.append(overview);

  const steps = recipe.guide?.steps ?? [];
  if (steps.length) {
    const section = element("section", "steps");
    section.append(element("h2", "", "Étapes illustrées"));
    for (const step of steps) {
      const row = element("article", "step");
      const media = imageMedia(step.image, step.image_alt ?? `Étape ${step.order} : ${step.title}`);
      media.className = "step-media";
      const copy = element("div", "step-copy");
      copy.append(element("p", "step-number", `Étape ${step.order}${step.duration_minutes ? ` · ${formatNumber(step.duration_minutes, 0)} min` : ""}`));
      copy.append(element("h3", "", step.title));
      copy.append(element("p", "", step.beginner_instruction ?? step.short_instruction ?? "Instruction non disponible."));
      if (step.completion_check) copy.append(element("p", "meta", `Repère : ${step.completion_check}`));
      row.append(media, copy);
      section.append(row);
    }
    view.content.append(section);
  }

  if (recipe.url) {
    const actions = element("div", "actions");
    actions.append(button("Ouvrir sur agentvegan.org", async () => {
      try { await openExternal(recipe.url); } catch (error) { showError(error instanceof Error ? error.message : "Lien impossible à ouvrir."); }
    }, "primary"));
    view.content.append(actions);
  }
  appendEnvelopeFooter(view.container, envelope);
  replaceRoot(view.container);
}

function availabilityLabel(value: string | null | undefined): { label: string; className: string } {
  if (value === "in_stock" || value === "listed") return { label: "Référencé", className: "chip good" };
  if (value === "unavailable" || value === "out_of_stock") return { label: "Indisponible lors du relevé", className: "chip warn" };
  if (value === "not_found") return { label: "Non trouvé", className: "chip warn" };
  return { label: "Statut non confirmé", className: "chip" };
}

function productCard(product: ProductCard): HTMLElement {
  const card = element("article", "card");
  card.append(imageMedia(product.image_url, `Photo produit : ${product.name}`));
  const body = element("div", "card-body");
  body.append(element("h3", "", product.name));
  if (product.brand) body.append(element("p", "meta", product.brand));
  const bestOffer = product.offers.find((offer) => offer.availability === "in_stock") ?? product.offers[0];
  if (bestOffer) {
    const availability = availabilityLabel(bestOffer.availability);
    const chips = element("div", "chips");
    chips.append(element("span", availability.className, availability.label));
    chips.append(element("span", "chip", normalizeLabel(bestOffer.retailer_id)));
    body.append(chips, element("p", "meta", `Vérifié le ${formatDate(bestOffer.checked_at)}`));
    if (bestOffer.price_cents !== null && bestOffer.price_cents !== undefined) {
      body.append(element("p", "", `${formatNumber(bestOffer.price_cents / 100, 2)} €${bestOffer.unit_price ? ` · ${bestOffer.unit_price}` : ""}`));
    }
    if (bestOffer.product_url) body.append(button("Voir l’offre datée", async () => {
      try { await openExternal(bestOffer.product_url); } catch (error) { showError(error instanceof Error ? error.message : "Lien impossible à ouvrir."); }
    }));
  } else {
    body.append(element("p", "warning", "Aucune offre publique datée n’est reliée à ce produit."));
  }
  card.append(body);
  return card;
}

function renderProductGalleryPage(pageIndex: number, envelope: Envelope): void {
  const page = productPages[pageIndex];
  if (!page) return showError("Page de produits introuvable.");
  const view = shell("Produits végétaux", "AgentVegan · offres commerciales datées");
  addFullscreenAction(view.actions);
  const carousel = element("div", "carousel");
  carousel.setAttribute("aria-label", "Carrousel de produits végétaux");
  for (const product of page.items) carousel.append(productCard(product));
  view.content.append(carousel);
  const pager = element("div", "pager");
  const previous = button("Page précédente", () => renderProductGalleryPage(pageIndex - 1, envelope));
  previous.disabled = pageIndex === 0;
  const next = button("Page suivante", async () => {
    const cached = productPages[pageIndex + 1];
    if (cached) return renderProductGalleryPage(pageIndex + 1, envelope);
    if (!page.nextCursor) return;
    next.disabled = true;
    try {
      const response = await callTool("search_plant_products", { ...productSearch, limit: 8, cursor: page.nextCursor });
      const items = z.array(ProductCardSchema).safeParse(response.data);
      if (!items.success || !items.data.length) throw new Error("La page suivante de produits est vide ou invalide.");
      productPages.push({ items: items.data, nextCursor: response.next_cursor });
      currentEnvelope = response;
      renderProductGalleryPage(pageIndex + 1, response);
    } catch (error) {
      showError(error instanceof Error ? error.message : "Pagination impossible.");
    }
  });
  next.disabled = !page.nextCursor;
  pager.append(previous, element("span", "meta", `Page ${pageIndex + 1}`), next);
  view.content.append(pager);
  appendEnvelopeFooter(view.container, envelope);
  replaceRoot(view.container);
}

function renderProductGallery(data: z.infer<typeof ProductGalleryDataSchema>, envelope: Envelope): void {
  productSearch = data.search;
  productPages = [{ items: data.items, nextCursor: data.next_cursor }];
  renderProductGalleryPage(0, envelope);
}

function renderNutrition(data: z.infer<typeof NutritionDataSchema>, envelope: Envelope): void {
  const view = shell("Comparaison nutritionnelle", `AgentVegan · base ${data.basis.replaceAll("_", " ")}`);
  addFullscreenAction(view.actions);
  const nutrientMap = new Map<string, { label: string; unit: string }>();
  for (const series of data.series) for (const nutrient of series.nutrients) nutrientMap.set(nutrient.id, { label: nutrient.label || normalizeLabel(nutrient.id), unit: nutrient.unit });
  const controls = element("div", "comparison-controls");
  controls.append(element("strong", "", "Nutriment"));
  const select = element("select");
  select.setAttribute("aria-label", "Nutriment comparé");
  for (const [id, meta] of nutrientMap) {
    const option = element("option", "", meta.label);
    option.value = id;
    select.append(option);
  }
  controls.append(select);
  const bars = element("div", "bars");
  const draw = (): void => {
    bars.replaceChildren();
    const nutrientId = select.value;
    const values = data.series.map((series) => ({ series, nutrient: series.nutrients.find((item) => item.id === nutrientId) })).filter((item) => item.nutrient !== undefined);
    const maximum = Math.max(...values.map((item) => ((item.nutrient?.min ?? 0) + (item.nutrient?.max ?? 0)) / 2), 0.0001);
    for (const item of values) {
      const nutrient = item.nutrient;
      if (!nutrient) continue;
      const row = element("div", "bar-row");
      row.append(element("strong", "", item.series.name));
      const track = element("div", "bar-track");
      const fill = element("div", "bar-fill");
      fill.style.width = `${Math.max(1, (((nutrient.min + nutrient.max) / 2) / maximum) * 100)}%`;
      track.append(fill);
      const prefix = nutrient.status === "sourced_lower_bound" ? "au moins " : "";
      const amount = nutrient.min === nutrient.max
        ? `${formatNumber(nutrient.min)} ${nutrient.unit}`
        : `${formatNumber(nutrient.min)}–${formatNumber(nutrient.max)} ${nutrient.unit}`;
      row.append(track, element("span", "", `${prefix}${amount}`));
      bars.append(row);
    }
  };
  select.addEventListener("change", draw);
  view.content.append(controls, bars, element("p", "warning", "Les valeurs nutritionnelles ne remplacent pas un avis médical."));
  draw();
  appendEnvelopeFooter(view.container, envelope);
  replaceRoot(view.container);
}

function renderEvidence(container: HTMLElement, envelope: Envelope): void {
  const parsed = z.object({
    ingredient: z.unknown(),
    evidence: z.array(z.object({
      id: z.string(),
      status: z.string(),
      checked_at: optionalString,
      product_name: optionalString,
      store_scope: optionalString,
      retailer: z.object({ label: z.string() }).passthrough().nullable().optional(),
    }).passthrough()),
  }).safeParse(envelope.data);
  container.replaceChildren();
  if (!parsed.success) return container.append(element("p", "error", "Les preuves magasins reçues sont invalides."));
  if (!parsed.data.evidence.length) return container.append(element("p", "empty", "Aucune preuve magasin publique pour cet ingrédient."));
  const list = element("div", "evidence-list");
  for (const evidence of parsed.data.evidence) {
    const item = element("article", "evidence");
    const status = availabilityLabel(evidence.status);
    const top = element("div", "section-title");
    top.append(element("strong", "", evidence.retailer?.label ?? "Enseigne non nommée"), element("span", status.className, status.label));
    item.append(top);
    if (evidence.product_name) item.append(element("p", "", evidence.product_name));
    item.append(element("p", "meta", `${evidence.store_scope ?? "Périmètre non précisé"} · vérifié le ${formatDate(evidence.checked_at)}`));
    list.append(item);
  }
  container.append(list);
}

function renderSubstitutions(container: HTMLElement, envelope: Envelope): void {
  const parsed = z.object({
    ingredient: z.unknown(),
    substitutions: z.array(z.object({
      id: z.string(),
      replacement_name: z.string(),
      quantity_conversion: optionalString,
      culinary_rationale: optionalString,
      kind: z.string(),
    }).passthrough()),
  }).safeParse(envelope.data);
  container.replaceChildren();
  if (!parsed.success) return container.append(element("p", "error", "Les substitutions reçues sont invalides."));
  if (!parsed.data.substitutions.length) return container.append(element("p", "empty", "Aucune substitution culinaire validée dans cette version."));
  const list = element("div", "evidence-list");
  for (const substitution of parsed.data.substitutions) {
    const item = element("article", "evidence");
    item.append(element("h3", "", substitution.replacement_name));
    item.append(element("span", "chip", substitution.kind === "adaptation_de_recette" ? "Adaptation de recette" : "Remplacement fonctionnel"));
    if (substitution.quantity_conversion) item.append(element("p", "", substitution.quantity_conversion));
    if (substitution.culinary_rationale) item.append(element("p", "meta", substitution.culinary_rationale));
    list.append(item);
  }
  container.append(list);
}

function renderIngredient(ingredient: Ingredient, envelope: Envelope): void {
  const view = shell(ingredient.name, "AgentVegan · ingrédient canonique");
  addFullscreenAction(view.actions);
  if (ingredient.aliases.length) view.content.append(element("p", "muted", `Aussi appelé : ${ingredient.aliases.join(", ")}.`));
  const status = ingredient.substitution_status === "substitutable"
    ? "Substitutions culinaires documentées"
    : ingredient.substitution_status === "sans_substitut_pertinent"
      ? "Sans substitut pertinent identifié"
      : "Substitution non applicable";
  view.content.append(element("span", "chip", status));

  if (ingredient.recipes.length) {
    view.content.append(element("h2", "", "Recettes associées"));
    const carousel = element("div", "carousel");
    for (const recipe of ingredient.recipes.slice(0, 4)) carousel.append(recipeCard(recipe));
    view.content.append(carousel);
  }

  const columns = element("div", "detail-grid");
  const stores = element("section", "panel");
  stores.append(element("h2", "", "Où l’acheter"));
  const storesResult = element("div");
  storesResult.append(element("p", "status", "Chargement des preuves magasins…"));
  stores.append(storesResult);
  const substitutions = element("section", "panel");
  substitutions.append(element("h2", "", "Substitutions culinaires"));
  const substitutionsResult = element("div");
  substitutionsResult.append(element("p", "status", "Chargement des substitutions…"));
  substitutions.append(substitutionsResult);
  columns.append(stores, substitutions);
  view.content.append(columns);
  appendEnvelopeFooter(view.container, envelope);
  replaceRoot(view.container);

  void Promise.allSettled([
    callTool("find_stores_for_ingredient", { ingredient: ingredient.id, limit: 20 }).then((result) => renderEvidence(storesResult, result)),
    callTool("find_substitutes", { ingredient: ingredient.id, limit: 20 }).then((result) => renderSubstitutions(substitutionsResult, result)),
  ]).then((results) => {
    if (results[0]?.status === "rejected") storesResult.replaceChildren(element("p", "error", results[0].reason instanceof Error ? results[0].reason.message : "Chargement impossible."));
    if (results[1]?.status === "rejected") substitutionsResult.replaceChildren(element("p", "error", results[1].reason instanceof Error ? results[1].reason.message : "Chargement impossible."));
  });
}

function handleToolResult(value: unknown): void {
  const envelope = EnvelopeSchema.safeParse(value);
  if (!envelope.success) return showError("Le résultat de l’outil ne respecte pas le contrat AgentVegan public.");
  currentEnvelope = envelope.data;
  const data = envelope.data.data;

  const recipeGallery = RecipeGalleryDataSchema.safeParse(data);
  if (recipeGallery.success) return renderRecipeGallery(recipeGallery.data, envelope.data);
  const recipeDetail = RecipeDetailDataSchema.safeParse(data);
  if (recipeDetail.success) return renderRecipeDetail(recipeDetail.data.recipe, envelope.data);
  const productGallery = ProductGalleryDataSchema.safeParse(data);
  if (productGallery.success) return renderProductGallery(productGallery.data, envelope.data);
  const nutrition = NutritionDataSchema.safeParse(data);
  if (nutrition.success) return renderNutrition(nutrition.data, envelope.data);
  const ingredient = IngredientDataSchema.safeParse(data);
  if (ingredient.success) return renderIngredient(ingredient.data.ingredient, envelope.data);
  showError("Cette ressource interactive ne reconnaît pas le type de vue demandé.");
}

function applyHostContext(): void {
  const context = app.getHostContext();
  document.documentElement.dataset.theme = context?.theme === "dark" ? "dark" : "light";
  if (context?.locale) document.documentElement.lang = context.locale;
}

app.addEventListener("toolresult", (result) => handleToolResult(result.structuredContent));
app.addEventListener("hostcontextchanged", applyHostContext);

void app.connect().then(() => {
  connected = true;
  applyHostContext();
}).catch((error: unknown) => {
  showError(error instanceof Error ? `Connexion à l’hôte impossible : ${error.message}` : "Connexion à l’hôte impossible.");
});

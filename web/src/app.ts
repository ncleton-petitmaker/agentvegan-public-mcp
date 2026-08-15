import { App } from "@modelcontextprotocol/ext-apps";
import { z } from "zod";
import "./styles.css";
import { canonicalLocale } from "./locale";
import { toolResultPayloadCandidates } from "./tool-result";

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

const OPEN_LINK_ORIGINS = new Set([
  ...IMAGE_ORIGINS,
  "https://mcp.agentvegan.org",
  "https://doi.org",
  "https://extension.usu.edu",
  "https://fdc.nal.usda.gov",
  "https://lafourche.fr",
  "https://www.anses.fr",
  "https://www.efsa.europa.eu",
  "https://www.fao.org",
  "https://www.foodstandards.gov.au",
  "https://www.greenweez.com",
  "https://www.houra.fr",
  "https://www.kingarthurbaking.com",
  "https://www.koro.fr",
  "https://www.matvaretabellen.no",
  "https://www.who.int",
]);
const optionalString = z.string().nullable().optional();
const optionalNumber = z.number().finite().nullable().optional();
const imageUrl = z.string().url().refine((value) => {
  try { return IMAGE_ORIGINS.has(new URL(value).origin); } catch { return false; }
}, "Origine d’image non autorisée").nullable().optional();
const recipeImageUrl = z.string().url().refine((value) => {
  try { return new URL(value).origin === "https://agentvegan.org"; } catch { return false; }
}, "L’image de recette doit provenir du domaine public AgentVegan");
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
  servings_count: optionalNumber,
  step_count: optionalNumber,
  image_url: recipeImageUrl,
  url: safeLink,
  nutrition: z.array(NutrientScoreSchema).optional().default([]),
}).passthrough();

const RecipeStepSchema = z.object({
  id: z.string(),
  order: z.number().int().nonnegative(),
  title: z.string(),
  duration_minutes: optionalNumber,
  short_instruction: optionalString,
  beginner_instruction: z.string().min(1),
  why_it_matters: optionalString,
  completion_check: optionalString,
  common_mistakes: z.array(z.string()).optional().default([]),
  visible_ingredient_ids: z.array(z.string()).optional().default([]),
  image: recipeImageUrl,
  image_alt: z.string().min(1),
}).passthrough();

const RecipeDetailSchema = RecipeCardSchema.extend({
  ingredients: z.array(z.object({
    id: optionalString,
    ingredient_id: optionalString,
    name: z.string(),
    amount: optionalString,
  }).passthrough()),
  guide: z.object({
    overview: optionalString,
    total_minutes: optionalNumber,
    active_minutes: optionalNumber,
    steps: z.array(RecipeStepSchema).min(1),
  }).passthrough(),
  nutrition: z.object({
    basis: optionalString,
    priority_scores: z.array(NutrientScoreSchema).min(1),
  }).passthrough(),
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
  sources: z.array(z.object({
    id: z.string(),
    label: z.string(),
    url: z.string().url(),
  }).passthrough()),
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
  view: z.enum(["recipe_detail", "recipe_kitchen"]),
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
  toolOutput?: unknown;
  toolInput?: unknown;
  toolResponseMetadata?: unknown;
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
  { name: "Agent Vegan", version: "2.0.5" },
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
let activeTimer: number | null = null;
let latestToolArguments: Record<string, unknown> = {};
let restoreInFlight = false;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function replaceRoot(node: Node): void {
  if (activeTimer !== null) {
    window.clearInterval(activeTimer);
    activeTimer = null;
  }
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
  const locale = canonicalLocale(app.getHostContext()?.locale ?? document.documentElement.lang);
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}

function formatNumber(value: number, maximumFractionDigits = 1): string {
  const locale = canonicalLocale(app.getHostContext()?.locale ?? document.documentElement.lang);
  return new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);
}

function normalizeLabel(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function imageMedia(url: string | null | undefined, alt: string, loading: "lazy" | "eager" = "lazy"): HTMLElement {
  const media = element("div", "card-media");
  if (!url) {
    media.append(element("span", "image-error", "Image non disponible dans le catalogue public."));
    return media;
  }
  const image = element("img");
  image.alt = alt;
  image.loading = loading;
  image.decoding = "async";
  const preserveSourceRatio = (): void => {
    if (image.naturalWidth <= 0 || image.naturalHeight <= 0) return;
    media.style.setProperty("--media-aspect", `${image.naturalWidth} / ${image.naturalHeight}`);
    media.dataset.orientation = image.naturalWidth === image.naturalHeight
      ? "square"
      : image.naturalWidth > image.naturalHeight ? "landscape" : "portrait";
  };
  image.addEventListener("load", preserveSourceRatio, { once: true });
  image.addEventListener("error", () => {
    media.replaceChildren(element("span", "image-error", "L’image source n’est pas accessible actuellement."));
  }, { once: true });
  image.src = url;
  if (image.complete) preserveSourceRatio();
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

function nutrientAmount(score: z.infer<typeof NutrientScoreSchema>): string | null {
  const minimum = score.amount_per_serving_min;
  const maximum = score.amount_per_serving_max;
  if (minimum === null || minimum === undefined || maximum === null || maximum === undefined || score.status === "unproven") return null;
  if (score.status === "sourced_lower_bound") return `au moins ${formatNumber(minimum)} ${score.unit}`;
  if (Math.abs(maximum - minimum) > 0.0001) return `${formatNumber(minimum)}–${formatNumber(maximum)} ${score.unit}`;
  return `${formatNumber(minimum)} ${score.unit}`;
}

function recipeNutrientChips(recipe: RecipeCard | RecipeDetail, limit = 3): HTMLElement {
  const chips = element("div", "chips");
  const scores = Array.isArray(recipe.nutrition)
    ? recipe.nutrition
    : recipe.nutrition?.priority_scores ?? [];
  const preferred = ["protein_g", "iron_mg", "fiber_g", "calcium_mg"];
  const ordered = [...scores].sort((left, right) => {
    const leftRank = preferred.indexOf(left.key);
    const rightRank = preferred.indexOf(right.key);
    return (leftRank < 0 ? preferred.length : leftRank) - (rightRank < 0 ? preferred.length : rightRank);
  });
  for (const score of ordered) {
    const amount = nutrientAmount(score);
    if (!amount) continue;
    chips.append(element("span", "chip", `${score.label} · ${amount}`));
    if (chips.childElementCount >= limit) break;
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
  for (const candidate of toolResultPayloadCandidates(result)) {
    const parsed = EnvelopeSchema.safeParse(candidate);
    if (parsed.success) return parsed.data;
  }
  throw new Error(`La réponse de ${name} ne contient aucun contrat public AgentVegan valide.`);
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

async function showRecipe(recipeId: string, startCooking = false): Promise<void> {
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
    if (startCooking) {
      await requestFullscreen();
      renderCookMode(recipe.data, envelope, 0);
    } else {
      renderRecipeDetail(recipe.data, envelope);
    }
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
  if (recipe.step_count !== null && recipe.step_count !== undefined) facts.append(element("span", "chip", `${formatNumber(recipe.step_count, 0)} étapes`));
  if (recipe.servings_count !== null && recipe.servings_count !== undefined) facts.append(element("span", "chip", `${formatNumber(recipe.servings_count, 0)} portions`));
  if (recipe.meal) facts.append(element("span", "chip", recipe.meal));
  const cardActions = element("div", "card-actions");
  cardActions.append(
    button("Découvrir", () => showRecipe(recipe.id)),
    button("Cuisiner", () => showRecipe(recipe.id, true), "primary"),
  );
  body.append(facts, recipeNutrientChips(recipe), cardActions);
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

function recipeFacts(recipe: RecipeDetail | RecipeCard): HTMLElement {
  const facts = element("div", "facts");
  if (recipe.prep_minutes !== null && recipe.prep_minutes !== undefined) facts.append(element("span", "fact", `⏱ ${formatNumber(recipe.prep_minutes, 0)} min`));
  if (recipe.step_count !== null && recipe.step_count !== undefined) facts.append(element("span", "fact", `◉ ${formatNumber(recipe.step_count, 0)} étapes`));
  if (recipe.servings_count !== null && recipe.servings_count !== undefined) facts.append(element("span", "fact", `♨ ${formatNumber(recipe.servings_count, 0)} portions`));
  if (recipe.meal) facts.append(element("span", "fact", recipe.meal));
  return facts;
}

function ingredientChecklist(recipe: RecipeDetail): HTMLElement {
  const panel = element("section", "panel mise-en-place");
  panel.append(element("p", "eyebrow", "Mise en place"), element("h2", "", "Tout préparer avant de commencer"));
  const list = element("div", "checklist");
  recipe.ingredients.forEach((ingredient, index) => {
    const label = element("label", "check-row");
    const checkbox = element("input");
    checkbox.type = "checkbox";
    checkbox.name = `ingredient-${index}`;
    const copy = element("span");
    if (ingredient.amount) copy.append(element("strong", "", ingredient.amount), document.createTextNode(` · ${ingredient.name}`));
    else copy.textContent = ingredient.name;
    label.append(checkbox, copy);
    list.append(label);
  });
  panel.append(list);
  return panel;
}

function nutritionPanel(recipe: RecipeDetail): HTMLElement {
  const panel = element("section", "panel nutrition-panel");
  panel.append(element("p", "eyebrow", "Nutrition sourcée"), element("h2", "", `Par ${recipe.nutrition.basis === "par_portion" ? "portion" : recipe.nutrition.basis?.replaceAll("_", " ") ?? "base déclarée"}`));
  const metrics = element("div", "nutrition-grid");
  for (const score of recipe.nutrition.priority_scores) {
    const amount = nutrientAmount(score);
    if (!amount) continue;
    const metric = element("div", "metric");
    metric.append(element("span", "meta", score.label), element("strong", "", amount));
    const status = score.status === "sourced_range"
      ? "intervalle sourcé"
      : score.status === "sourced_lower_bound"
        ? "minimum sourcé"
        : "valeur sourcée";
    metric.append(element("small", "metric-status", status));
    metrics.append(metric);
  }
  if (!metrics.childElementCount) panel.append(element("p", "error", "Aucune valeur nutritionnelle démontrée n’est disponible pour cette recette."));
  else panel.append(metrics);
  panel.append(element("p", "nutrition-notice", "Ces données décrivent la recette et ne remplacent pas un avis médical."));
  return panel;
}

function sourcesPanel(envelope: Envelope): HTMLElement {
  const details = element("details", "sources-panel");
  const summary = element("summary", "", `${envelope.sources.length} source${envelope.sources.length > 1 ? "s" : ""} et provenance`);
  details.append(summary);
  const list = element("div", "source-list");
  for (const source of envelope.sources) {
    const row = element("div", "source-row");
    row.append(element("span", "", source.label));
    row.append(button("Consulter", async () => {
      try { await openExternal(source.url); } catch (error) { showError(error instanceof Error ? error.message : "Source impossible à ouvrir."); }
    }));
    list.append(row);
  }
  details.append(list);
  return details;
}

function visibleIngredientsForStep(recipe: RecipeDetail, step: z.infer<typeof RecipeStepSchema>): string[] {
  const byId = new Map<string, string>();
  for (const ingredient of recipe.ingredients) {
    if (ingredient.id) byId.set(ingredient.id, ingredient.name);
    if (ingredient.ingredient_id) byId.set(ingredient.ingredient_id, ingredient.name);
  }
  return [...new Set(step.visible_ingredient_ids.map((id) => byId.get(id)).filter((value): value is string => Boolean(value)))];
}

async function updateCookingContext(recipe: RecipeDetail, stepIndex: number): Promise<void> {
  const step = recipe.guide.steps[stepIndex];
  if (!step || !app.getHostCapabilities()?.updateModelContext) return;
  await app.updateModelContext({
    content: [{
      type: "text",
      text: `L’utilisateur cuisine « ${recipe.title} » et consulte l’étape ${step.order}/${recipe.guide.steps.length} : ${step.title}. Instruction exacte : ${step.beginner_instruction}`,
    }],
    structuredContent: {
      agentvegan_view: "cook_mode",
      recipe_id: recipe.id,
      recipe_title: recipe.title,
      step_index: stepIndex,
      step_order: step.order,
      step_title: step.title,
    },
  });
}

function timerControl(durationMinutes: number | null | undefined): HTMLElement | null {
  if (durationMinutes === null || durationMinutes === undefined || durationMinutes <= 0) return null;
  const totalSeconds = Math.max(1, Math.round(durationMinutes * 60));
  let remaining = totalSeconds;
  let running = false;
  const panel = element("section", "timer");
  const label = element("span", "timer-label", "Minuteur de l’étape");
  const display = element("strong", "timer-display");
  display.setAttribute("aria-live", "polite");
  const controls = element("div", "timer-actions");
  const renderTime = (): void => {
    const minutes = Math.floor(remaining / 60).toString().padStart(2, "0");
    const seconds = (remaining % 60).toString().padStart(2, "0");
    display.textContent = `${minutes}:${seconds}`;
  };
  const toggle = button("Démarrer", () => {
    running = !running;
    toggle.textContent = running ? "Pause" : "Reprendre";
    if (running && activeTimer === null) {
      activeTimer = window.setInterval(() => {
        if (!running) return;
        remaining = Math.max(0, remaining - 1);
        renderTime();
        if (remaining === 0 && activeTimer !== null) {
          window.clearInterval(activeTimer);
          activeTimer = null;
          running = false;
          toggle.textContent = "Terminé";
          toggle.disabled = true;
          panel.classList.add("timer-finished");
        }
      }, 1000);
    }
  }, "primary");
  const reset = button("Réinitialiser", () => {
    running = false;
    remaining = totalSeconds;
    if (activeTimer !== null) window.clearInterval(activeTimer);
    activeTimer = null;
    toggle.disabled = false;
    toggle.textContent = "Démarrer";
    panel.classList.remove("timer-finished");
    renderTime();
  });
  controls.append(toggle, reset);
  renderTime();
  panel.append(label, display, controls);
  return panel;
}

function renderCookMode(recipe: RecipeDetail, envelope: Envelope, requestedIndex: number): void {
  const steps = recipe.guide.steps;
  const stepIndex = Math.max(0, Math.min(requestedIndex, steps.length - 1));
  const step = steps[stepIndex];
  if (!step) return showError("L’étape demandée n’existe pas dans cette recette.");
  persistChatGptState({ selected_recipe_id: recipe.id, cook_step_index: stepIndex });
  void updateCookingContext(recipe, stepIndex).catch(() => undefined);

  const container = element("section", "cook-shell");
  const top = element("header", "cook-header");
  const back = button("Vue d’ensemble", () => renderRecipeDetail(recipe, envelope));
  const identity = element("div", "cook-identity");
  identity.append(element("p", "eyebrow", recipe.title), element("strong", "", `Étape ${stepIndex + 1} sur ${steps.length}`));
  top.append(back, identity);
  const progress = element("div", "progress-track");
  const progressFill = element("div", "progress-fill");
  progressFill.style.width = `${((stepIndex + 1) / steps.length) * 100}%`;
  progress.append(progressFill);

  const stage = element("main", "cook-stage");
  const media = imageMedia(step.image, step.image_alt, "eager");
  media.className = "cook-media";
  const copy = element("article", "cook-copy");
  copy.append(element("p", "step-number", `Étape ${step.order}${step.duration_minutes ? ` · ${formatNumber(step.duration_minutes, 0)} min` : ""}`));
  copy.append(element("h1", "", step.title), element("p", "cook-instruction", step.beginner_instruction));
  const visibleIngredients = visibleIngredientsForStep(recipe, step);
  if (visibleIngredients.length) {
    const chips = element("div", "chips");
    for (const ingredient of visibleIngredients) chips.append(element("span", "chip", ingredient));
    copy.append(element("p", "section-label", "Ingrédients visibles"), chips);
  }
  const timer = timerControl(step.duration_minutes);
  if (timer) copy.append(timer);
  const guidance = element("div", "guidance-grid");
  if (step.completion_check) {
    const card = element("section", "guidance good-guidance");
    card.append(element("strong", "", "✓ Comment savoir que c’est prêt"), element("p", "", step.completion_check));
    guidance.append(card);
  }
  if (step.why_it_matters) {
    const card = element("section", "guidance");
    card.append(element("strong", "", "Pourquoi ce geste"), element("p", "", step.why_it_matters));
    guidance.append(card);
  }
  if (step.common_mistakes.length) {
    const card = element("section", "guidance warning-guidance");
    card.append(element("strong", "", "À éviter"));
    const list = element("ul", "list");
    for (const mistake of step.common_mistakes) list.append(element("li", "", mistake));
    card.append(list);
    guidance.append(card);
  }
  if (guidance.childElementCount) copy.append(guidance);
  copy.append(element("p", "conversation-hint", "Une question pendant cette étape ? Écrivez-la dans la conversation : AgentVegan connaît l’étape affichée."));
  stage.append(media, copy);

  const nav = element("nav", "cook-nav");
  const previous = button("← Étape précédente", () => renderCookMode(recipe, envelope, stepIndex - 1));
  previous.disabled = stepIndex === 0;
  const next = button(stepIndex === steps.length - 1 ? "Terminer la recette ✓" : "Étape suivante →", () => {
    if (stepIndex === steps.length - 1) renderRecipeDetail(recipe, envelope);
    else renderCookMode(recipe, envelope, stepIndex + 1);
  }, "primary");
  nav.append(previous, next);
  container.append(top, progress, stage, nav);
  replaceRoot(container);
}

function renderRecipeDetail(recipe: RecipeDetail, envelope: Envelope): void {
  const view = shell(recipe.title, "Agent Vegan · recette complète");
  if (savedGallery) view.actions.append(button("Retour aux recettes", () => savedGallery?.()));
  addFullscreenAction(view.actions);

  const heroStage = element("section", "hero-stage");
  const hero = imageMedia(recipe.image_url, `Photo du plat terminé : ${recipe.title}`, "eager");
  hero.className = "hero";
  const heroCopy = element("div", "hero-copy");
  if (recipe.subtitle) heroCopy.append(element("p", "hero-subtitle", recipe.subtitle));
  heroCopy.append(recipeFacts(recipe));
  const start = button(`Commencer · ${recipe.guide.steps.length} étapes`, async () => {
    await requestFullscreen();
    renderCookMode(recipe, envelope, 0);
  }, "primary start-cooking");
  heroCopy.append(start);
  heroStage.append(hero, heroCopy);
  view.content.append(heroStage);

  if (recipe.guide.overview) {
    const intro = element("section", "recipe-intro");
    intro.append(element("p", "eyebrow", "Le plat"), element("p", "lead", recipe.guide.overview));
    view.content.append(intro);
  }

  const overview = element("div", "detail-grid");
  overview.append(ingredientChecklist(recipe), nutritionPanel(recipe));
  view.content.append(overview);

  const stepsSection = element("section", "step-library");
  const heading = element("div", "section-title");
  heading.append(element("div", "", ""), element("span", "chip good", `${recipe.guide.steps.length} images · ${recipe.guide.steps.length} instructions`));
  heading.firstElementChild?.append(element("p", "eyebrow", "Parcours complet"), element("h2", "", "Toutes les étapes, sans résumé inventé"));
  stepsSection.append(heading);
  const steps = element("div", "step-filmstrip");
  recipe.guide.steps.forEach((step, index) => {
    const card = element("article", "step-card");
    const media = imageMedia(step.image, step.image_alt);
    media.className = "step-card-media";
    const copy = element("div", "step-card-copy");
    copy.append(element("p", "step-number", `Étape ${step.order}${step.duration_minutes ? ` · ${formatNumber(step.duration_minutes, 0)} min` : ""}`));
    copy.append(element("h3", "", step.title), element("p", "", step.beginner_instruction));
    copy.append(button("Ouvrir cette étape", async () => {
      await requestFullscreen();
      renderCookMode(recipe, envelope, index);
    }));
    card.append(media, copy);
    steps.append(card);
  });
  stepsSection.append(steps);
  view.content.append(stepsSection, sourcesPanel(envelope));

  if (recipe.url) {
    const actions = element("div", "actions footer-actions");
    actions.append(button("Ouvrir la page publique", async () => {
      try { await openExternal(recipe.url); } catch (error) { showError(error instanceof Error ? error.message : "Lien impossible à ouvrir."); }
    }));
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

  const rawRecipeGallery = z.array(RecipeCardSchema).min(1).max(50).safeParse(data);
  if (rawRecipeGallery.success) {
    return renderRecipeGallery({
      view: "recipe_gallery",
      items: rawRecipeGallery.data.slice(0, 8),
      search: {},
      next_cursor: envelope.data.next_cursor,
    }, envelope.data);
  }
  const rawRecipeDetail = RecipeDetailSchema.safeParse(data);
  if (rawRecipeDetail.success) return renderRecipeDetail(rawRecipeDetail.data, envelope.data);

  const recipeGallery = RecipeGalleryDataSchema.safeParse(data);
  if (recipeGallery.success) return renderRecipeGallery(recipeGallery.data, envelope.data);
  const recipeDetail = RecipeDetailDataSchema.safeParse(data);
  if (recipeDetail.success) {
    if (recipeDetail.data.view === "recipe_kitchen") {
      void requestFullscreen().catch(() => undefined);
      return renderCookMode(recipeDetail.data.recipe, envelope.data, 0);
    }
    return renderRecipeDetail(recipeDetail.data.recipe, envelope.data);
  }
  const productGallery = ProductGalleryDataSchema.safeParse(data);
  if (productGallery.success) return renderProductGallery(productGallery.data, envelope.data);
  const nutrition = NutritionDataSchema.safeParse(data);
  if (nutrition.success) return renderNutrition(nutrition.data, envelope.data);
  const ingredient = IngredientDataSchema.safeParse(data);
  if (ingredient.success) return renderIngredient(ingredient.data.ingredient, envelope.data);
  showError("Cette ressource interactive ne reconnaît pas le type de vue demandé.");
}

function replayChatGptToolOutput(value: unknown = window.openai?.toolOutput): boolean {
  const direct = EnvelopeSchema.safeParse(value);
  if (direct.success) {
    handleToolResult(direct.data);
    return true;
  }
  if (!value || typeof value !== "object") return false;
  for (const candidate of toolResultPayloadCandidates(value)) {
    if (!EnvelopeSchema.safeParse(candidate).success) continue;
    handleToolResult(candidate);
    return true;
  }
  return false;
}

function recoveryToolName(): string | null {
  const declared = app.getHostContext()?.toolInfo?.tool.name;
  if (typeof declared === "string" && [
    "search_recipes",
    "get_recipe",
    "explore_recipes",
    "cook_recipe",
    "explore_plant_products",
    "compare_nutrition_interactively",
    "explore_ingredient",
  ].includes(declared)) return declared;
  if (typeof latestToolArguments.recipe_id === "string") return "cook_recipe";
  if (typeof latestToolArguments.id === "string") return "get_recipe";
  if (Array.isArray(latestToolArguments.entities)) return "compare_nutrition_interactively";
  if (typeof latestToolArguments.ingredient === "string") return "explore_ingredient";
  return "explore_recipes";
}

async function restoreFromToolInput(): Promise<boolean> {
  if (restoreInFlight) return false;
  restoreInFlight = true;
  try {
    for (let attempt = 0; attempt < 40 && !connected; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
    if (!connected || currentEnvelope !== null) return currentEnvelope !== null;
    const name = recoveryToolName();
    if (!name) return false;
    const envelope = await callTool(name, latestToolArguments);
    handleToolResult(envelope);
    return currentEnvelope !== null;
  } catch {
    return false;
  } finally {
    restoreInFlight = false;
  }
}

function applyHostContext(): void {
  const context = app.getHostContext();
  document.documentElement.dataset.theme = context?.theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.displayMode = context?.displayMode ?? "inline";
  document.documentElement.lang = canonicalLocale(context?.locale ?? document.documentElement.lang);
}

app.addEventListener("toolinput", (input) => {
  latestToolArguments = input.arguments ?? {};
});
app.addEventListener("toolresult", (result) => {
  for (const candidate of toolResultPayloadCandidates(result)) {
    if (!EnvelopeSchema.safeParse(candidate).success) continue;
    handleToolResult(candidate);
    return;
  }
  if (replayChatGptToolOutput()) return;
  replaceRoot(element("p", "status", "Restauration de l’app Agent Vegan…"));
  void restoreFromToolInput().then((restored) => {
    if (!restored && currentEnvelope === null) showError("Le résultat de l’outil ne contient aucun contrat public AgentVegan valide.");
  });
});
app.addEventListener("hostcontextchanged", applyHostContext);
window.addEventListener("openai:set_globals", (event) => {
  const globals = (event as CustomEvent<{ globals?: OpenAiExtensions }>).detail?.globals;
  if (globals?.toolOutput !== undefined) replayChatGptToolOutput(globals.toolOutput);
});
app.onteardown = async () => {
  if (activeTimer !== null) window.clearInterval(activeTimer);
  activeTimer = null;
  return {};
};

void app.connect().then(() => {
  connected = true;
  applyHostContext();
  if (currentEnvelope === null) replayChatGptToolOutput();
}).catch((error: unknown) => {
  showError(error instanceof Error ? `Connexion à l’hôte impossible : ${error.message}` : "Connexion à l’hôte impossible.");
});

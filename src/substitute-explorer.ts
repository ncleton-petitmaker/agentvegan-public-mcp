import type { JsonObject, PlantProduct, SubstitutionRule } from "./contracts.js";
import { normalize } from "./utils.js";

export interface SubstituteCategory {
  id: string;
  label: string;
  aliases: string[];
}

const SUBSTITUTE_CATEGORIES: SubstituteCategory[] = [
  { id: "poulet-vegetal", label: "Poulet végétal", aliases: ["poulet", "volaille", "chicken", "escalope de poulet", "blanc de poulet", "nuggets de poulet"] },
  { id: "jambon-et-charcuterie-vegetale", label: "Jambon et charcuterie végétale", aliases: ["jambon", "charcuterie", "bacon", "lardons", "mortadelle", "salami", "chorizo"] },
  { id: "saucisses-et-merguez-vegetales", label: "Saucisses et merguez végétales", aliases: ["saucisse", "saucisses", "merguez", "chipolata", "hot dog"] },
  { id: "steaks-et-burgers-vegetaux", label: "Steaks, hachés et burgers végétaux", aliases: ["boeuf", "bœuf", "steak", "steak hache", "viande hachee", "burger"] },
  { id: "boulettes-et-eminces-vegetaux", label: "Boulettes, émincés et effilochés végétaux", aliases: ["boulette", "boulettes", "emince", "eminces", "effiloche", "effiloches"] },
  { id: "proteines-vegetales-texturees", label: "Protéines végétales texturées", aliases: ["proteines de soja texturees", "pst", "pvt", "proteines vegetales texturees"] },
  { id: "poisson-et-fruits-de-mer-vegetaux", label: "Poisson et fruits de mer végétaux", aliases: ["poisson", "saumon", "thon", "crevette", "crabe", "fruits de mer"] },
  { id: "tofu-tempeh-et-seitan", label: "Tofu, tempeh et seitan", aliases: ["tofu", "tempeh", "seitan"] },
  { id: "fromages-vegetaux", label: "Fromages végétaux", aliases: ["fromage", "mozzarella", "parmesan", "cheddar", "feta"] },
  { id: "cremes-et-yaourts-vegetaux", label: "Crèmes et yaourts végétaux", aliases: ["creme", "yaourt", "yogourt", "creme fraiche"] },
  { id: "alternatives-a-l-oeuf", label: "Alternatives à l’œuf", aliases: ["oeuf", "œuf", "oeufs", "œufs", "blanc d oeuf", "jaune d oeuf", "omelette"] },
];

function containsWholePhrase(haystack: string, phrase: string): boolean {
  return ` ${haystack} `.includes(` ${normalize(phrase)} `);
}

export function resolveSubstituteCategory(target: string): SubstituteCategory | null {
  const normalizedTarget = normalize(target);
  if (!normalizedTarget) return null;
  return SUBSTITUTE_CATEGORIES.find((category) => (
    normalizedTarget === normalize(category.id)
    || normalizedTarget === normalize(category.label)
    || category.aliases.some((alias) => containsWholePhrase(normalizedTarget, alias))
  )) ?? null;
}

interface ScoreCriterion extends JsonObject {
  id: string;
  label: string;
  points: number;
  maximum: number;
  status: "verified" | "partial" | "missing";
  detail: string;
}

function criterion(id: string, label: string, points: number, maximum: number, detail: string): ScoreCriterion {
  return {
    id,
    label,
    points,
    maximum,
    status: points === maximum ? "verified" : points > 0 ? "partial" : "missing",
    detail,
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function ageInDays(checkedAt: string, evidenceAt: string | null): number | null {
  if (!evidenceAt) return null;
  const checked = Date.parse(checkedAt);
  const evidence = Date.parse(evidenceAt);
  if (!Number.isFinite(checked) || !Number.isFinite(evidence)) return null;
  return Math.max(0, (checked - evidence) / 86_400_000);
}

export function commercialSubstituteForUi(product: PlantProduct, category: SubstituteCategory, checkedAt: string): JsonObject {
  const nutrition = record(product.nutrition) as JsonObject | null;
  const displayNutriScore = record(nutrition?.display_nutri_score);
  const nutriScoreGrade = text(displayNutriScore?.grade)?.toLowerCase();
  if (!nutrition || !nutriScoreGrade || !/^[a-e]$/u.test(nutriScoreGrade)) {
    throw new Error(`Nutri-Score public absent ou invalide pour ${product.id}.`);
  }
  const offers = product.offers.map(record).filter((offer): offer is Record<string, unknown> => offer !== null);
  const inStockOffer = offers.find((offer) => offer.availability === "in_stock");
  const bestOffer = inStockOffer ?? offers[0] ?? null;
  const veganProof = offers.map((offer) => text(offer.vegan_proof)).find((value): value is string => value !== null) ?? null;
  const evidenceAt = text(bestOffer?.checked_at) ?? text(product.last_seen_at);
  const ageDays = ageInDays(checkedAt, evidenceAt);
  const freshnessPoints = ageDays === null ? 0 : ageDays <= 10 ? 15 : ageDays <= 30 ? 8 : 0;
  const hasProductUrl = text(bestOffer?.product_url) !== null;
  const hasPrice = typeof bestOffer?.price_cents === "number" && Number.isFinite(bestOffer.price_cents);
  const hasImage = text(product.image_url) !== null;
  const traceabilityPoints = (hasProductUrl ? 4 : 0) + (hasPrice ? 2 : 0) + (hasImage ? 4 : 0);
  const criteria = [
    criterion("category", "Catégorie de remplacement", 35, 35, `Classé explicitement dans « ${category.label} » par le catalogue public.`),
    criterion("vegan_proof", "Preuve végane", veganProof ? 20 : 0, 20, veganProof ? `Preuve publique enregistrée : ${veganProof.replaceAll("_", " ")}.` : "Aucune preuve végane exploitable n’est enregistrée."),
    criterion("availability", "Disponibilité constatée", inStockOffer ? 20 : bestOffer ? 8 : 0, 20, inStockOffer ? "Au moins une offre était en stock lors du dernier relevé." : bestOffer ? "Une offre est enregistrée, mais aucun stock positif n’est démontré." : "Aucune offre datée n’est reliée à ce produit."),
    criterion("freshness", "Fraîcheur du relevé", freshnessPoints, 15, ageDays === null ? "Date de contrôle inexploitable." : `Dernier relevé il y a ${Math.floor(ageDays)} jour(s) à la date du catalogue.`),
    criterion("traceability", "Fiche traçable", traceabilityPoints, 10, `Lien marchand ${hasProductUrl ? "présent" : "absent"}, prix ${hasPrice ? "daté" : "non publié"}, image ${hasImage ? "présente" : "absente"}.`),
  ];
  const score = criteria.reduce((total, item) => total + item.points, 0);
  return {
    kind: "commercial_product",
    id: product.id,
    name: product.name,
    brand: product.brand ?? null,
    category_id: product.category_id ?? null,
    category_label: category.label,
    image_url: product.image_url ?? null,
    last_seen_at: product.last_seen_at ?? null,
    offers: product.offers,
    score,
    score_label: "Score de preuve catalogue",
    score_basis: "Catégorie exacte, preuve végane, disponibilité datée, fraîcheur et traçabilité de la fiche.",
    score_criteria: criteria,
    nutrition,
    nutrition_status: text(nutrition.status) ?? "missing",
    nutrition_message: nutrition.status === "complete"
      ? "Composition nutritionnelle complète publiée sur une base de 100 g."
      : nutrition.status === "partial"
        ? "Composition nutritionnelle partielle publiée sur une base de 100 g."
        : "Les valeurs nutritionnelles chiffrées ne sont pas disponibles pour ce produit ; la provenance du Nutri-Score reste indiquée.",
  };
}

export function culinarySubstituteForUi(rule: SubstitutionRule): JsonObject {
  const contexts = Array.isArray(rule.contexts) ? rule.contexts.filter((value): value is string => typeof value === "string" && value.trim().length > 0) : [];
  const sourceIds = [rule.source_id, ...(Array.isArray(rule.source_ids) ? rule.source_ids : [])]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  const quantity = text(rule.quantity_conversion);
  const rationale = text(rule.culinary_rationale);
  const criteria = [
    criterion("validated_rule", "Règle publique validée", 35, 35, "Cette proposition est une règle de substitution publiée dans le catalogue Agent Vegan."),
    criterion("source", "Source traçable", sourceIds.length ? 25 : 0, 25, sourceIds.length ? `${sourceIds.length} référence(s) publique(s) reliée(s).` : "Aucune référence publique n’est reliée à cette règle."),
    criterion("conversion", "Conversion de quantité", quantity ? 15 : 0, 15, quantity ?? "Conversion non documentée."),
    criterion("rationale", "Justification culinaire", rationale ? 15 : 0, 15, rationale ?? "Justification culinaire non documentée."),
    criterion("contexts", "Contextes d’usage", contexts.length ? 10 : 0, 10, contexts.length ? contexts.join(", ") : "Aucun contexte générique documenté ; la règle peut être propre à une recette."),
  ];
  const score = criteria.reduce((total, item) => total + item.points, 0);
  return {
    kind: "culinary_rule",
    id: rule.id,
    name: rule.replacement_name,
    score,
    score_label: "Score de documentation culinaire",
    score_basis: "Validation, sources, conversion, justification et contextes publiés.",
    score_criteria: criteria,
    quantity_conversion: quantity,
    culinary_rationale: rationale,
    contexts,
    excluded_contexts: Array.isArray(rule.excluded_contexts) ? rule.excluded_contexts : [],
    rule_kind: rule.kind,
    recipe_id: rule.recipe_id ?? null,
    nutrition_status: "not_compared",
    nutrition_message: "Ce score porte sur l’usage culinaire, pas sur l’équivalence nutritionnelle.",
  };
}

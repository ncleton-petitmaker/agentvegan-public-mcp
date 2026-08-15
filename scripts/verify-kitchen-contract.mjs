import { readFile } from "node:fs/promises";

const catalog = JSON.parse(await readFile(new URL("../data/catalog.json", import.meta.url), "utf8"));
const minimums = { recipes: 431, steps: 1_949, images: 2_380, priorityNutrientsPerRecipe: 16 };
const failures = [];
const imageUrls = [];

if (!Array.isArray(catalog.recipes) || catalog.recipes.length < minimums.recipes) {
  failures.push(`Couverture recettes en régression : ${catalog.recipes?.length ?? 0} < ${minimums.recipes}.`);
}

let stepCount = 0;
for (const recipe of catalog.recipes ?? []) {
  const context = `recette ${recipe.id ?? "sans identifiant"}`;
  if (typeof recipe.image_url !== "string" || !recipe.image_url.trim()) failures.push(`Image principale absente pour ${context}.`);
  else imageUrls.push(new URL(recipe.image_url, "https://agentvegan.org").href);

  const steps = recipe.guide?.steps;
  if (!Array.isArray(steps) || !steps.length) {
    failures.push(`Guide vide pour ${context}.`);
    continue;
  }
  stepCount += steps.length;
  for (const [index, step] of steps.entries()) {
    const stepContext = `${context}, étape ${index + 1}`;
    if (typeof step.beginner_instruction !== "string" || !step.beginner_instruction.trim()) failures.push(`Instruction absente pour ${stepContext}.`);
    if (!Number.isFinite(step.duration_minutes) || step.duration_minutes < 0) failures.push(`Durée invalide pour ${stepContext}.`);
    if (typeof step.image_alt !== "string" || !step.image_alt.trim()) failures.push(`Texte alternatif absent pour ${stepContext}.`);
    if (typeof step.image !== "string" || !step.image.trim()) failures.push(`Image absente pour ${stepContext}.`);
    else imageUrls.push(new URL(step.image, "https://agentvegan.org").href);
  }

  const nutrients = recipe.nutrition?.priority_scores;
  if (recipe.nutrition?.basis !== "par_portion") failures.push(`Base nutritionnelle invalide pour ${context}.`);
  if (!Array.isArray(nutrients) || nutrients.length < minimums.priorityNutrientsPerRecipe) {
    failures.push(`Nutriments prioritaires incomplets pour ${context} : ${nutrients?.length ?? 0} < ${minimums.priorityNutrientsPerRecipe}.`);
  }
}

if (stepCount < minimums.steps) failures.push(`Couverture étapes en régression : ${stepCount} < ${minimums.steps}.`);
if (imageUrls.length < minimums.images) failures.push(`Couverture images en régression : ${imageUrls.length} < ${minimums.images}.`);
if (new Set(imageUrls).size !== imageUrls.length) failures.push("Le contrat Kitchen contient des URL d’images dupliquées.");

if (process.argv.includes("--remote") && failures.length === 0) {
  const pending = [...imageUrls];
  const remoteFailures = [];
  const workers = Array.from({ length: 20 }, async () => {
    while (pending.length) {
      const url = pending.shift();
      if (!url) return;
      try {
        const response = await fetch(url, { method: "HEAD", redirect: "follow" });
        const contentType = response.headers.get("content-type") ?? "";
        const contentLength = Number(response.headers.get("content-length") ?? 0);
        if (!response.ok || !contentType.startsWith("image/") || contentLength <= 0) {
          remoteFailures.push(`${url} → HTTP ${response.status}, ${contentType || "sans content-type"}, ${contentLength} octets.`);
        }
      } catch (error) {
        remoteFailures.push(`${url} → ${error instanceof Error ? error.message : String(error)}.`);
      }
    }
  });
  await Promise.all(workers);
  failures.push(...remoteFailures);
}

if (failures.length) {
  throw new Error(`Contrat Agent Vegan invalide (${failures.length} erreur(s)) :\n${failures.slice(0, 30).join("\n")}`);
}

process.stdout.write(`Agent Vegan vérifié : ${catalog.recipes.length} recettes, ${stepCount} étapes, ${imageUrls.length} images, ${minimums.priorityNutrientsPerRecipe} nutriments prioritaires par recette${process.argv.includes("--remote") ? " et toutes les images publiques en ligne" : ""}.\n`);

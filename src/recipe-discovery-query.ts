const GENERIC_DISCOVERY_TERMS = new Set([
  "a", "affiche", "afficher", "affichez", "au", "aux", "avec", "d", "dans", "de", "des", "donne", "donner", "donnez", "du",
  "en", "et", "je", "l", "me", "moi", "montre", "montrer", "montrez", "nous", "please", "pour", "propose", "proposer",
  "proposez", "quelques", "recette", "recettes", "s", "souhaite", "suggere", "suggerer", "suggerez", "stp",
  "svp", "trouve", "trouver", "trouvez", "un", "une", "vegan", "vegane", "veganes", "vegans", "vegetalien",
  "vegetalienne", "vegetaliennes", "vegetaliens", "veux", "voudrais",
]);

function fold(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/gu, "").toLocaleLowerCase("fr-FR");
}

export function normalizeRecipeDiscoveryQuery(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const tokens = value.match(/[\p{L}\p{N}]+/gu) ?? [];
  const specific = tokens.filter((token) => {
    const normalized = fold(token);
    return !/^\d+$/u.test(normalized) && !GENERIC_DISCOVERY_TERMS.has(normalized);
  });
  return specific.length ? specific.join(" ") : undefined;
}

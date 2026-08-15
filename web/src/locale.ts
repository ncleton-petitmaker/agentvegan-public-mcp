export function canonicalLocale(value: string | null | undefined): string {
  const candidate = value?.trim().replaceAll("_", "-") || "fr-FR";
  try {
    return Intl.getCanonicalLocales(candidate)[0] ?? "fr-FR";
  } catch {
    return "fr-FR";
  }
}

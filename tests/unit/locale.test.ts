import { describe, expect, it } from "vitest";
import { canonicalLocale } from "../../web/src/locale.js";

describe("locale MCP Apps", () => {
  it("normalise les locales mobiles avec underscore", () => {
    expect(canonicalLocale("fr_FR")).toBe("fr-FR");
    expect(canonicalLocale("en_US")).toBe("en-US");
  });

  it("conserve une locale BCP 47 valide", () => {
    expect(canonicalLocale("fr-FR")).toBe("fr-FR");
  });

  it("utilise le français pour une locale hôte invalide", () => {
    expect(canonicalLocale("pas_une_locale_!!!")).toBe("fr-FR");
    expect(canonicalLocale(undefined)).toBe("fr-FR");
  });
});

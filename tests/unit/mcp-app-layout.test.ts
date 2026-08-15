import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve("web/src/styles.css"), "utf8");

function declarations(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = styles.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`, "u"));
  if (!match?.[1]) throw new Error(`Sélecteur CSS introuvable : ${selector}`);
  return match[1];
}

describe("mise en page MCP App", () => {
  it("ne lie jamais la hauteur intégrée du cockpit à la hauteur auto-redimensionnée de l’iframe", () => {
    for (const selector of [".cook-shell", ".cook-stage", ".cook-media", ".cook-media img", ".cook-nav"]) {
      expect(declarations(selector), selector).not.toMatch(/\b(?:min-|max-)?height\s*:[^;}]*\b(?:dvh|vh)\b/u);
    }
    expect(declarations(".cook-nav")).not.toContain("position: sticky");
  });

  it("borne le cockpit plein écran et confie le défilement à la zone des étapes", () => {
    expect(declarations(':root[data-display-mode="fullscreen"] .cook-shell')).toContain("height: 100%");
    expect(declarations(':root[data-display-mode="fullscreen"] .cook-shell')).toContain("overflow: hidden");
    expect(declarations(':root[data-display-mode="fullscreen"] .cook-stage')).toContain("overflow-y: auto");
    expect(declarations(':root[data-display-mode="fullscreen"] .cook-stage')).toContain("overscroll-behavior: contain");
  });
});

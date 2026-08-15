import { describe, expect, it } from "vitest";
import { rateLimitKey } from "../../src/rate-limit-key.js";

describe("rateLimitKey", () => {
  it("isole les utilisateurs ChatGPT derrière une même adresse de sortie", () => {
    const request = new Request("https://mcp.agentvegan.org/mcp", {
      headers: { "X-OpenAI-Subject": "v1/tJtPINICKjYolWMrg6noCAaGwkhEOTYLej9EiYOBSVnYLEHcnBEBEw", "CF-Connecting-IP": "9.129.58.41" },
    });
    expect(rateLimitKey(request)).toBe("v1/tJtPINICKjYolWMrg6noCAaGwkhEOTYLej9EiYOBSVnYLEHcnBEBEw");
  });

  it("utilise l’adresse réseau pour les autres clients", () => {
    const request = new Request("https://mcp.agentvegan.org/mcp", { headers: { "CF-Connecting-IP": "203.0.113.7" } });
    expect(rateLimitKey(request)).toBe("203.0.113.7");
  });

  it("ignore un faux identifiant OpenAI non borné", () => {
    const request = new Request("https://mcp.agentvegan.org/mcp", {
      headers: { "X-OpenAI-Subject": "spoofed-subject", "CF-Connecting-IP": "203.0.113.8" },
    });
    expect(rateLimitKey(request)).toBe("203.0.113.8");
  });
});

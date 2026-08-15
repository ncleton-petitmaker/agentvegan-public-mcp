import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const port = Number(process.env.AGENTVEGAN_PREVIEW_PORT ?? 4310);
const appHtml = await readFile(new URL("../web/dist/index.html", import.meta.url), "utf8");
const apiBase = "https://mcp.agentvegan.org/api/v1";

async function api(path) {
  const response = await fetch(`${apiBase}${path}`);
  if (!response.ok) throw new Error(`API AgentVegan ${path} → HTTP ${response.status}.`);
  return response.json();
}

const initialSearch = await api("/recipes?limit=6");
const initialItems = await Promise.all(initialSearch.data.map(async (recipe) => ({
  ...recipe,
  detail: (await api(`/recipes/${encodeURIComponent(recipe.id)}`)).data,
})));
const initialResult = {
  ...initialSearch,
  data: {
    view: "recipe_gallery",
    items: initialItems,
    search: { limit: 6 },
    next_cursor: initialSearch.next_cursor,
  },
};

function json(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

const hostHtml = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Agent Vegan · hôte de validation</title>
  <style>
    *{box-sizing:border-box}body{margin:0;background:#e7f1e4;color:#102415;font-family:Inter,ui-sans-serif,system-ui,sans-serif}.host{max-width:1440px;margin:auto;padding:18px}.bar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px}.bar strong{font-size:15px}.status{border-radius:999px;background:#d8f4c7;color:#15582e;padding:7px 11px;font-size:12px;font-weight:750}.frame{display:block;width:100%;height:820px;border:1px solid #bad2b8;border-radius:20px;background:#fff;box-shadow:0 20px 65px #183f2524}.frame.fullscreen{position:fixed;z-index:20;inset:0;width:100vw;height:100vh;border:0;border-radius:0}.hint{color:#4f6653;font-size:12px}
  </style>
</head>
<body>
  <main class="host">
    <header class="bar"><div><strong>Validation réelle · Agent Vegan 2.0.10</strong><div class="hint">Données chargées depuis mcp.agentvegan.org</div></div><span id="status" class="status">Connexion au bridge…</span></header>
    <iframe id="app" class="frame" title="Agent Vegan" src="/app" sandbox="allow-scripts"></iframe>
  </main>
  <script>
    const initialResult = ${json(initialResult)};
    const simulateReload = new URLSearchParams(location.search).has("reload-empty");
    const frame = document.querySelector("#app");
    const status = document.querySelector("#status");
    let initialized = false;
    const send = (message) => frame.contentWindow.postMessage(message, "*");
    const resultEnvelope = (structuredContent) => ({
      structuredContent,
      content: [{ type: "text", text: JSON.stringify(structuredContent) }],
    });
    async function proxyTool(params) {
      const name = params?.name;
      const args = params?.arguments ?? {};
      let url;
      if (name === "get_recipe") url = "/recipes/" + encodeURIComponent(args.id);
      else if (name === "search_recipes" || name === "explore_recipes") {
        const query = new URLSearchParams();
        for (const [key, value] of Object.entries(args)) {
          if (value === undefined || value === null) continue;
          if (Array.isArray(value)) for (const item of value) query.append(key, String(item));
          else query.set(key, String(value));
        }
        url = "/recipes?" + query.toString();
      } else throw new Error("Outil non pris en charge par l’hôte visuel : " + name);
      const response = await fetch(${json(apiBase)} + url);
      if (!response.ok) throw new Error("API " + url + " → HTTP " + response.status);
      return resultEnvelope(await response.json());
    }
    window.addEventListener("message", async (event) => {
      if (event.source !== frame.contentWindow) return;
      const message = event.data;
      if (!message || message.jsonrpc !== "2.0") return;
      try {
        if (message.method === "ui/initialize") {
          send({ jsonrpc: "2.0", id: message.id, result: {
            protocolVersion: message.params.protocolVersion,
            hostInfo: { name: "agentvegan-visual-proof", version: "2.0.10" },
            hostCapabilities: {
              openLinks: {},
              serverTools: {},
              updateModelContext: { text: {}, structuredContent: {} },
            },
            hostContext: {
              theme: "light",
              displayMode: "inline",
              availableDisplayModes: ["inline", "fullscreen"],
              containerDimensions: { width: 1400, maxHeight: 820 },
              locale: "fr_FR",
              timeZone: "Europe/Paris",
              platform: new URLSearchParams(location.search).has("mobile") ? "mobile" : "web",
              deviceCapabilities: new URLSearchParams(location.search).has("mobile")
                ? { touch: true, hover: false }
                : { touch: false, hover: true },
            },
          }});
          return;
        }
        if (message.method === "ui/notifications/initialized" && !initialized) {
          initialized = true;
          status.textContent = "Bridge connecté · données de production";
          send({ jsonrpc: "2.0", method: "ui/notifications/tool-input", params: { arguments: { limit: 6 } } });
          send({
            jsonrpc: "2.0",
            method: "ui/notifications/tool-result",
            params: simulateReload ? {} : resultEnvelope(initialResult),
          });
          return;
        }
        if (message.method === "tools/call") {
          send({ jsonrpc: "2.0", id: message.id, result: await proxyTool(message.params) });
          return;
        }
        if (message.method === "ui/request-display-mode") {
          const mode = message.params?.mode === "fullscreen" ? "fullscreen" : "inline";
          frame.classList.toggle("fullscreen", mode === "fullscreen");
          send({ jsonrpc: "2.0", id: message.id, result: { mode } });
          send({ jsonrpc: "2.0", method: "ui/notifications/host-context-changed", params: { displayMode: mode } });
          return;
        }
        if (message.method === "ui/update-model-context") {
          send({ jsonrpc: "2.0", id: message.id, result: {} });
          return;
        }
        if (message.method === "ui/open-link") {
          send({ jsonrpc: "2.0", id: message.id, result: {} });
          return;
        }
      } catch (error) {
        if (message.id !== undefined) send({ jsonrpc: "2.0", id: message.id, error: { code: -32000, message: error instanceof Error ? error.message : String(error) } });
      }
    });
  </script>
</body>
</html>`;

const server = createServer((request, response) => {
  if (request.url === "/app") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    response.end(appHtml);
    return;
  }
  if (request.url === "/") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    response.end(hostHtml);
    return;
  }
  response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  response.end("Introuvable");
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`Hôte visuel Agent Vegan : http://127.0.0.1:${port}/\n`);
});

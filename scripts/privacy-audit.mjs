import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";

const root = resolve(import.meta.dirname, "..");
const forbiddenKeys = new Set(["account_id", "account_scope", "access_token", "authorization", "cookie", "cookies", "owner", "password", "primary_product_id", "product_id", "provider_evidence", "raw_evidence_path", "refresh_token", "runtime_path", "runtime_workspace", "session", "session_id", "token", "username"]);
const localPathPattern = /(?:\/Users\/|\/Volumes\/|\/home\/|\.agentvegan-runtime)/u;
const secretPattern = /(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/u;

function inspect(value, path) {
  if (Array.isArray(value)) { value.forEach((item, index) => inspect(item, `${path}[${index}]`)); return; }
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && (localPathPattern.test(value) || secretPattern.test(value))) throw new Error(`Valeur privée détectée dans ${path}.`);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKeys.has(key)) throw new Error(`Champ privé détecté dans ${path}.${key}.`);
    inspect(child, `${path}.${key}`);
  }
}

for (const filename of ["catalog.json", "manifest.json"]) {
  const text = await readFile(resolve(root, "data", filename), "utf8");
  if (localPathPattern.test(text) || secretPattern.test(text)) throw new Error(`Secret ou chemin local détecté dans data/${filename}.`);
  inspect(JSON.parse(text), `data/${filename}`);
}
for (const filename of await readdir(resolve(root, "exports/v1"))) {
  const buffer = await readFile(resolve(root, "exports/v1", filename));
  const text = filename.endsWith(".gz") ? gunzipSync(buffer).toString("utf8") : buffer.toString("utf8");
  if (localPathPattern.test(text) || secretPattern.test(text)) throw new Error(`Secret ou chemin local détecté dans exports/v1/${filename}.`);
  if (filename.endsWith(".json")) inspect(JSON.parse(text), `exports/v1/${filename}`);
  if (filename.endsWith(".jsonl.gz")) text.trim().split("\n").forEach((line, index) => inspect(JSON.parse(line), `exports/v1/${filename}:${index + 1}`));
}
const worker = await readFile(resolve(root, "src/worker.ts"), "utf8");
if (/console\.(?:log|info|warn|error)\([^\n]*(?:req\.|request\.|query|body|prompt)/u.test(worker)) {
  throw new Error("Le Worker semble journaliser une requête, un prompt, un corps ou une query.");
}
process.stdout.write("Audit confidentialité réussi : données publiques, exports et journalisation inspectés.\n");

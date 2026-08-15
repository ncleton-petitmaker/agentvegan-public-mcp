# AgentVegan Public MCP

## Scope

- This repository serves only the versioned public projection produced by
  `agentvegan-landing`.
- Never read the personal AgentVegan platform at runtime. Never import profiles,
  private recipes, retailer sessions, provider product IDs, account scopes,
  credentials, personal D1 rows, R2 objects, captures, or local filesystem paths.
- The production endpoint is `https://mcp.agentvegan.org/mcp`; keep its Worker,
  D1 database, Git history, and DNS separate from both AgentVegan platform and
  landing deployments.
- All tools are read-only. Public data needs no login, OAuth flow, API key, or
  account creation.

## Data contract

- `data/catalog.json` and generated exports are build artefacts. Update them only
  with `npm run data:sync`, then run `npm test`.
- Refuse an import if the manifest hash, schema, baseline counts, privacy audit,
  source references, nutrition basis, or substitution classification is invalid.
- Publish a dataset atomically: import into a new D1 database/version, validate
  it, then change the Worker binding. Never partially update the active dataset.
- Availability is dated evidence, not a stock promise. Nutrition lower bounds
  stay labelled as lower bounds; an unproven sodium lower bound is omitted.
- Product images remain remote URLs. Never copy image bytes into this repository,
  the Worker bundle, or D1.

## Production quality

- Use natural French for every user-facing description, result, warning, and
  error.
- Never add fake data, silent fallbacks, placeholder integrations, or degraded
  success responses. Fail with a stable error code and an actionable French
  message.
- Do not log prompts, search terms, request bodies, IP addresses, or tool result
  payloads. Metrics may contain only route/tool name, status, latency, volume,
  and dataset age.
- Every code change must pass type checking, unit tests, integration tests, the
  privacy audit, export verification, and a real MCP initialization/tool-listing
  smoke test before publication.

## Git and providers

- `AGENTS.md` is the shared source of truth for OpenAI Codex and Anthropic Claude
  Code; `CLAUDE.md` imports it.
- Never commit on a branch whose corresponding `origin/<branch>` cannot receive
  the exact commit. Do not rewrite published history.

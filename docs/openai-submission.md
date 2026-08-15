# Dossier de soumission OpenAI — AgentVegan

## Identité et URLs

- Nom : AgentVegan
- Type : plugin MCP-only, public, sans OAuth, lecture seule
- MCP : `https://mcp.agentvegan.org/mcp`
- Site d’aide : `https://mcp.agentvegan.org/support`
- Confidentialité : `https://mcp.agentvegan.org/privacy`
- Conditions : `https://mcp.agentvegan.org/terms`
- Challenge : `https://mcp.agentvegan.org/.well-known/openai-apps-challenge`

Le secret `OPENAI_APPS_CHALLENGE` doit être défini avec la valeur fournie par OpenAI avant la soumission.

## Cinq tests positifs

1. « Où acheter du tahini ? » — `find_stores_for_ingredient`, preuves `listed`, enseignes uniques, dates et avertissement de stock.
2. « Par quoi remplacer un œuf dans des pancakes ? » — `find_substitutes`, règle fonctionnelle, quantité et limites culinaires sourcées.
3. « Trouve une recette riche en fer en moins de 30 minutes. » — `search_recipes` avec `iron_mg`, seuil et temps.
4. « Compare le tofu et le seitan sur 100 g. » — `compare_nutrition`, base `100_g`, unités, méthode et sources.
5. « Donne-moi les étapes et la nutrition de cette recette. » — `get_recipe` après recherche, avec sources et bornes.

## Trois tests négatifs

1. Ingrédient ambigu (« tofu cuit ») — erreur `AMBIGUOUS_INGREDIENT` et choix d’identifiants, aucune sélection arbitraire.
2. Preuve périmée ou enseigne indisponible — avertissement de fraîcheur et statut réel, aucune promesse de stock.
3. Base nutritionnelle incompatible ou sodium non démontré — `UNSUPPORTED_BASIS` ou omission explicite, aucune estimation fiable inventée.

## Go/no-go Free France

Après approbation, tester sur un compte ChatGPT Free web vierge en France : installation depuis le répertoire, invocation par `@AgentVegan`, recherche de recette et consultation d’une enseigne. Tout échec bloque la mention de compatibilité Free.

---
name: agentvegan-public-data
description: Consulter les données publiques AgentVegan pour les recettes véganes, ingrédients, nutriments, substitutions culinaires, enseignes et produits végétaux en France.
---

# AgentVegan Public Data

Utiliser ce skill lorsqu’une personne cherche une recette végane, un ingrédient, une comparaison nutritionnelle, une substitution culinaire ou une enseigne française susceptible de vendre un ingrédient.

## Règles d’utilisation

- Commencer par les outils de recherche, puis utiliser les identifiants stables dans les outils de détail.
- Pour une disponibilité, rappeler qu’une preuve datée ne garantit pas le stock actuel. Conserver le statut, le périmètre et `checked_at`.
- Ne jamais présenter un produit commercial comme une substitution culinaire universelle. Utiliser `find_substitutes` pour la fonction culinaire et `search_plant_products` pour les produits vendus.
- Pour la nutrition, annoncer la base (`100_g`, `portion` ou `recette`), l’unité, la méthode et la source. Garder les minimums comme minimums et ne pas transformer une valeur non démontrée en estimation.
- Les informations nutritionnelles ne remplacent pas un avis médical.
- En cas d’ingrédient ambigu, montrer les choix renvoyés et demander l’identifiant visé.
- En cas de `DATASET_STALE`, expliquer que le catalogue a dépassé sa durée maximale de fraîcheur et consulter `get_catalog_status`.
- Pour proposer ou faire choisir des recettes, appeler directement `explore_recipes`. Pour ouvrir une recette complète ou cuisiner pas à pas, appeler `cook_recipe`. Les outils `search_recipes` et `get_recipe` déclarent aussi Agent Vegan pour garantir l’affichage dans un hôte compatible.
- Pour les autres parcours visuels, utiliser `explore_plant_products`, `compare_nutrition_interactively` ou `explore_ingredient`.
- Limiter les galeries à 3–8 éléments. Conserver le contexte de recherche et `next_cursor` pour que l’interface puisse paginer sans perdre les filtres.

## Outils

Les neuf outils de données en lecture seule sont `search_recipes`, `get_recipe`, `search_ingredients`, `get_ingredient`, `find_stores_for_ingredient`, `find_substitutes`, `search_plant_products`, `compare_nutrition` et `get_catalog_status`. Les cinq outils visuels sont `explore_recipes`, `cook_recipe`, `explore_plant_products`, `compare_nutrition_interactively` et `explore_ingredient`. Ils ajoutent une interface MCP Apps sans remplacer les réponses texte et structurées.

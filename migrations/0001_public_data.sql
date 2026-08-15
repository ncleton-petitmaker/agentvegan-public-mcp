PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recipes (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  normalized_title TEXT NOT NULL,
  meal TEXT,
  prep_minutes INTEGER,
  json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS recipes_search_idx ON recipes(normalized_title, meal, prep_minutes);

CREATE TABLE IF NOT EXISTS ingredients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  marketplace_target_id TEXT,
  substitution_status TEXT NOT NULL,
  json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ingredients_search_idx ON ingredients(normalized_name);

CREATE TABLE IF NOT EXISTS ingredient_aliases (
  ingredient_id TEXT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  PRIMARY KEY (ingredient_id, normalized_alias)
);
CREATE INDEX IF NOT EXISTS ingredient_aliases_search_idx ON ingredient_aliases(normalized_alias);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  ingredient_id TEXT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  PRIMARY KEY (recipe_id, ingredient_id)
);
CREATE INDEX IF NOT EXISTS recipe_ingredients_ingredient_idx ON recipe_ingredients(ingredient_id);

CREATE TABLE IF NOT EXISTS recipe_nutrients (
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  nutrient_id TEXT NOT NULL,
  value_min REAL,
  value_max REAL,
  status TEXT NOT NULL,
  PRIMARY KEY (recipe_id, nutrient_id)
);
CREATE INDEX IF NOT EXISTS recipe_nutrients_search_idx ON recipe_nutrients(nutrient_id, value_min);

CREATE TABLE IF NOT EXISTS nutrients (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS retailers (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS availability_evidence (
  id TEXT PRIMARY KEY,
  ingredient_id TEXT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL,
  retailer_id TEXT NOT NULL REFERENCES retailers(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  checked_at TEXT,
  json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS availability_status_idx ON availability_evidence(status, checked_at);

CREATE TABLE IF NOT EXISTS substitution_rules (
  id TEXT PRIMARY KEY,
  ingredient_id TEXT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  replacement_ingredient_id TEXT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  recipe_id TEXT REFERENCES recipes(id) ON DELETE CASCADE,
  json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS substitution_ingredient_idx ON substitution_rules(ingredient_id, recipe_id);

CREATE TABLE IF NOT EXISTS plant_products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  brand TEXT,
  category_id TEXT,
  json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS plant_products_search_idx ON plant_products(normalized_name, category_id, brand);

CREATE TABLE IF NOT EXISTS plant_product_offers (
  product_id TEXT NOT NULL REFERENCES plant_products(id) ON DELETE CASCADE,
  retailer_id TEXT NOT NULL REFERENCES retailers(id) ON DELETE CASCADE,
  availability TEXT NOT NULL,
  checked_at TEXT,
  json TEXT NOT NULL,
  PRIMARY KEY (product_id, retailer_id)
);
CREATE INDEX IF NOT EXISTS plant_product_offers_search_idx ON plant_product_offers(retailer_id, availability);

CREATE TABLE IF NOT EXISTS source_references (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  json TEXT NOT NULL
);

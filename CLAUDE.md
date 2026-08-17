@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project does

A single-user webapp for weekly meal prep planning, built around one shared recipe/ingredient data model that powers three features:

1. **Weekly meal plan → grocery list.** Build out a week (day × meal slot → recipe, scaled to a number of people), then consolidate ingredients across every planned meal into one shopping list, grouped by grocery category.
2. **Filtered dish search.** Search the recipe catalog by diet tags (vegetarian, vegan, gluten-free, ...), cuisine, and nutrition ranges (calories/protein per serving).
3. **Pantry-based suggestions.** Give it a list of ingredients you have on hand; it ranks recipes by how many of their ingredients you already have, so you can find something to cook with what's in the fridge.

## Recipe data: seeded, not a live API

There is no external recipe API integration (Spoonacular etc. was considered and deliberately dropped). Instead, `prisma/seed-data.ts` is a hand-curated set of ~20 recipes (structured ingredients, rough nutrition estimates, diet tags, cuisines) spanning breakfast/lunch/dinner and multiple diets, meant for local dev/testing of search, filtering, consolidation, and pantry-matching — not verified nutrition-label data. `prisma/seed.ts` loads it via `RecipeSource.SEED`; user-entered recipes get `RecipeSource.CUSTOM` and are never touched by re-seeding (`prisma db seed` deletes and recreates `SEED` recipes only). Expand `seed-data.ts` directly to grow the mock catalog — no scraping pipeline exists or is planned.

## Commands

```bash
# Install dependencies
npm install

# Run the dev server (http://localhost:3000)
npm run dev

# Apply schema changes as a new migration (creates prisma/dev.db on first run)
npm run db:migrate

# Regenerate the Prisma client after editing schema.prisma without a migration
npm run db:generate

# (Re)load prisma/seed-data.ts into the database
npm run db:seed

# Drop the local db, reapply all migrations, and reseed
npm run db:reset

# Browse/edit the local database
npm run db:studio

# Typecheck / lint
npx tsc --noEmit
npm run lint
```

## Required files (not committed)

| File | Description |
|---|---|
| `.env` | `DATABASE_URL="file:./dev.db"` — created by `prisma init`, gitignored |
| `dev.db` | Local SQLite database file, gitignored; regenerate with `npm run db:migrate && npm run db:seed` |

## Architecture

**Stack:** Next.js (App Router, TypeScript) with server components/route handlers doing double duty as the backend — no separate API server. Tailwind CSS v4 for styling. Prisma 7 + SQLite (via the `@prisma/adapter-better-sqlite3` driver adapter) for persistence.

```
prisma/
  schema.prisma       # data model (see below)
  seed-data.ts         # curated mock recipe catalog (RecipeSource.SEED)
  seed.ts              # loads seed-data.ts into the db, wipes old SEED rows first
src/
  lib/prisma.ts        # PrismaClient singleton (globalThis-cached in dev to survive HMR)
  generated/prisma/    # Prisma client output — gitignored, regenerate with `npm run db:generate`
  app/                 # Next.js App Router pages/route handlers
```

### Prisma 7 note: driver adapters are required

This project was scaffolded against Prisma 7, which removed the `datasource.url` field from `schema.prisma` (`prisma migrate` reads the connection string from `prisma.config.ts`'s `datasource.url` instead) and requires `PrismaClient` to be constructed with an explicit driver `adapter` rather than inferring the connection from the schema. `src/lib/prisma.ts` does this with `PrismaBetterSqlite3` — always construct `PrismaClient` through that module rather than calling `new PrismaClient()` directly elsewhere, or the client won't have a datasource.

### Data model (`prisma/schema.prisma`)

- **`Recipe`** — title, servings, cuisine, instructions (newline-separated steps), per-serving nutrition, `source: CUSTOM | SEED`.
- **`Ingredient`** — canonical, deduplicated by `name` (unique), with a `category` (produce/dairy/meat/seafood/grains/pantry/spices/other) used to group the grocery list. This table is shared between `RecipeIngredient` and `PantryItem` — that shared identity is what makes pantry-matching and grocery consolidation possible; matching a pantry item to a recipe ingredient is a straight `ingredientId` join, not text/fuzzy matching.
- **`RecipeIngredient`** — join row: recipe + ingredient + `amount`/`unit`/`note`. `amount`/`unit` are nullable for "salt to taste" style entries.
- **`DietTag`** / **`RecipeDietTag`** — many-to-many, so dish search can filter by diet with a normal join/`some` query instead of parsing a delimited string column.
- **`MealPlan`** — one row per planned week (`weekStart`), containing **`MealPlanEntry`** rows (`dayOfWeek` 0-6, `mealSlot`, `recipe`, `people`). `people` is what scales a recipe's ingredient amounts when consolidating the grocery list.
- **`PantryItem`** — what you currently have; single-user, so no owner/user column.
- **`Preferences`** — single row (`id: "singleton"`) holding standing diet/restriction/nutrition-goal filters; single-user, so this is config, not a per-account table.

### Grocery list consolidation strategy

Combining ingredient amounts across recipes needs unit handling, and it won't always be exact:

- Merge automatically when `ingredientId` + `unit` match exactly (scaled by each `MealPlanEntry.people` vs. `Recipe.servings`).
- Convert and merge within a compatible unit family (volume↔volume: tsp/tbsp/cup; weight↔weight: g/oz/lb) via a small static conversion table.
- When units aren't reconcilable (e.g., "1 clove garlic" + "2 tsp minced garlic"), list them as separate line items under the same ingredient rather than guessing a conversion.
- Group the final list by `Ingredient.category` for a shopping-friendly layout.

This logic doesn't exist yet as of the initial scaffold — implement it as a pure function over `MealPlanEntry[]` (fetched with recipes/ingredients included) so it's unit-testable without a database.

### Pantry-matching strategy

Rank recipes by `(matched ingredient count) / (total ingredient count)`, where "matched" means the recipe's `ingredientId` appears in the user's `PantryItem` list — no unit/quantity comparison needed for a first pass (having *some* flour is enough to count as a match; whether it's *enough* flour is a stretch goal, not required for MVP).

## Key conventions

- **Single-user, no auth.** There's exactly one `Preferences` row and no user/account model anywhere. Don't add a `userId` column speculatively — if multi-user ever becomes a real requirement, that's a deliberate migration, not a default to design around now.
- **Prisma client access:** always import `{ prisma }` from `@/lib/prisma`; never instantiate `PrismaClient` ad hoc (see the driver-adapter note above).
- **Seed data vs. custom data:** never write code that deletes or mutates `RecipeSource.CUSTOM` recipes from a seeding/reset path. Only `SEED`-sourced rows are disposable.
- **`prisma/seed-data.ts`** is plain data (no DB calls) so it can be imported and asserted on in tests independent of `seed.ts`'s upsert logic.
- **Styling:** Tailwind v4, configured via `postcss.config.mjs` (no separate `tailwind.config.*` — v4 uses CSS-based config in `src/app/globals.css`).
- **`AGENTS.md`** is regenerated by `next dev` itself (see the file) — don't hand-edit its content beyond what's already there; `CLAUDE.md` imports it via `@AGENTS.md` so both stay in sync automatically.

@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project does

A single-user webapp for weekly meal prep planning, built around one shared recipe/ingredient data model that powers three features:

1. **Weekly meal plan → grocery list.** Build out a week (day × meal slot → recipe, scaled to a number of people), then consolidate ingredients across every planned meal into one shopping list, grouped by grocery category.
2. **Filtered dish search.** Search the recipe catalog by diet tags (vegetarian, vegan, gluten-free, ...), cuisine, and nutrition ranges (calories/protein per serving).
3. **Pantry-based suggestions.** Give it a list of ingredients you have on hand; it ranks recipes by how many of their ingredients you already have, so you can find something to cook with what's in the fridge.

## Recipe data: seeded, not a live API

There is no external recipe API integration (Spoonacular etc. was considered and deliberately dropped). Instead, `prisma/seed-data.ts` is a hand-curated set of ~20 recipes (structured ingredients, rough nutrition estimates, diet tags, cuisines) spanning breakfast/lunch/dinner and multiple diets, meant for local dev/testing of search, filtering, consolidation, and pantry-matching — not verified nutrition-label data. `prisma/seed.ts` loads it via `RecipeSource.SEED`; user-entered recipes get `RecipeSource.CUSTOM` and are never touched by re-seeding. Expand `seed-data.ts` directly to grow the mock catalog — no scraping pipeline exists or is planned.

`prisma db seed` **upserts by `(title, SEED)`, it does not delete-and-recreate.** `MealPlanEntry.recipe` has no `onDelete: Cascade` (see below), so once a seed recipe is referenced by a meal plan, deleting it throws a foreign key error — the seed script used to delete-then-recreate all `SEED` rows and broke exactly this way the first time a recipe was actually planned. Keep the upsert-by-title shape when editing `seed.ts`.

## Commands

```bash
# Install dependencies
npm install

# Run the dev server (http://localhost:3000)
npm run dev

# Apply schema changes as a new migration (needs DATABASE_URL pointing at a real Postgres instance — see below)
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
| `.env` | `DATABASE_URL="postgresql://..."` — gitignored; see "Database: Postgres, not SQLite" below for where this points locally vs. in deploy |

## Deployment (Render)

`render.yaml` at the repo root is a [Render Blueprint](https://render.com/docs/blueprint-spec): it declares a free Postgres instance (`meal-prep-planner-db`) and a free Node web service (`meal-prep-planner`), with the service's `DATABASE_URL` wired to the database automatically via `fromDatabase`. To deploy: on Render, **New → Blueprint**, point it at this repo/branch, review, and apply — that's the whole setup, no manual env var entry needed.

The web service's build command runs `prisma migrate deploy` and `prisma db seed` before `next build`, so every deploy brings the schema and mock recipe catalog up to date automatically (the seed's upsert-by-title behavior, see above, is exactly what makes this safe to run unconditionally on every build). `next start` reads `PORT` from the environment natively, which is how Render expects a web service to bind — no extra config needed there.

**`npm ci --include=dev` is required, not `npm ci`.** Render sets `NODE_ENV=production` for the build step (not just at runtime), and plain `npm ci` under `NODE_ENV=production` silently skips `devDependencies`. That breaks two things at once here: `tsx` (needed to run `prisma db seed`, which fails with `spawn tsx ENOENT`) and, less obviously, `typescript`/`tailwindcss`/`@types/*` (which `next build` itself needs even though they're conceptually dev tooling — Next.js doesn't build without them). `--include=dev` overrides the `NODE_ENV`-triggered skip for the install step only; the runtime (`next start`) is unaffected and still runs with `NODE_ENV=production`. Verified by reproducing Render's exact `npm ci` package count (182) locally under `NODE_ENV=production` before adding the flag, and 553 after.

If you ever need to run a one-off command (`prisma studio`, an ad hoc query) against the deployed database from a local checkout, point `DATABASE_URL` at the database's **External Database URL** from the Render dashboard (the `fromDatabase`-injected one on the web service is the *internal* URL, only reachable from other Render services in the same account).

## Architecture

**Stack:** Next.js (App Router, TypeScript) with server components/route handlers doing double duty as the backend — no separate API server. Tailwind CSS v4 for styling. Prisma 7 + PostgreSQL (via the `@prisma/adapter-pg` driver adapter) for persistence.

### Database: Postgres, not SQLite

The project started on SQLite (see git history) and moved to Postgres so the deployed app has real persistence — Render's free web service tier has an ephemeral filesystem, so a SQLite file there gets wiped on every redeploy and on every idle spin-down (~15 min of inactivity). There is no local SQLite fallback; `DATABASE_URL` must point at a real Postgres instance both locally and in deploy (a Render free Postgres instance is fine for both — see the Deployment section). The migration history was reset when the provider changed (SQLite and Postgres migration SQL aren't compatible), so `prisma/migrations/` starts fresh from the Postgres schema.

```
prisma/
  schema.prisma       # data model (see below)
  seed-data.ts         # curated mock recipe catalog (RecipeSource.SEED)
  seed.ts              # loads seed-data.ts into the db, upserting by (title, SEED)
src/
  lib/
    prisma.ts           # PrismaClient singleton (globalThis-cached in dev to survive HMR)
    week.ts             # week/day-of-week math (Monday-anchored, UTC) shared by the planner
    mealPlan.ts          # getOrCreateMealPlan(weekStartISO) — the planner's one entry point into MealPlan
    recipeSearch.ts      # dish search: query-string parsing + Prisma where-clause builder
    groceryList.ts       # buildGroceryList — pure ingredient consolidation over plain data
  generated/prisma/    # Prisma client output — gitignored, regenerate with `npm run db:generate`
  app/                 # Next.js App Router pages/route handlers
    page.tsx             # recipe list + filter form (narrow, max-w-3xl reading-width layout)
    recipes/[id]/
      page.tsx            # read-only recipe detail
    planner/
      page.tsx            # weekly planner grid (wide, max-w-[2200px] layout — see note below)
      actions.ts           # "use server" mutations: assignRecipe, updatePeople, removeEntry
      grocery-list/
        page.tsx            # consolidated shopping list for a week, via lib/groceryList.ts
```

### Prisma 7 note: driver adapters are required

This project was scaffolded against Prisma 7, which removed the `datasource.url` field from `schema.prisma` (`prisma migrate` reads the connection string from `prisma.config.ts`'s `datasource.url` instead) and requires `PrismaClient` to be constructed with an explicit driver `adapter` rather than inferring the connection from the schema. `src/lib/prisma.ts` does this with `PrismaBetterSqlite3` — always construct `PrismaClient` through that module rather than calling `new PrismaClient()` directly elsewhere, or the client won't have a datasource.

### Data model (`prisma/schema.prisma`)

- **`Recipe`** — title, servings, cuisine, instructions (newline-separated steps), per-serving nutrition, `source: CUSTOM | SEED`.
- **`Ingredient`** — canonical, deduplicated by `name` (unique), with a `category` (produce/dairy/meat/seafood/grains/pantry/spices/other) used to group the grocery list. This table is shared between `RecipeIngredient` and `PantryItem` — that shared identity is what makes pantry-matching and grocery consolidation possible; matching a pantry item to a recipe ingredient is a straight `ingredientId` join, not text/fuzzy matching.
- **`RecipeIngredient`** — join row: recipe + ingredient + `amount`/`unit`/`note`. `amount`/`unit` are nullable for "salt to taste" style entries.
- **`DietTag`** / **`RecipeDietTag`** — many-to-many, so dish search can filter by diet with a normal join/`some` query instead of parsing a delimited string column.
- **`MealPlan`** — one row per planned week (`weekStart`, `@unique`), containing **`MealPlanEntry`** rows (`dayOfWeek` 0-6, `mealSlot`, `recipe`, `people`). `people` is what scales a recipe's ingredient amounts when consolidating the grocery list. `MealPlanEntry` has `@@unique([mealPlanId, dayOfWeek, mealSlot])` — one recipe per grid cell by design (assigning a new recipe to an occupied cell replaces it via upsert, it doesn't add a second dish); relax this only if multi-dish-per-slot becomes an actual requirement. `MealPlanEntry.recipe` intentionally has no `onDelete: Cascade` — deleting a recipe that's currently planned should be a visible error, not a silent hole in the week (this is exactly what bit the seed script; see above).
- **`PantryItem`** — what you currently have; single-user, so no owner/user column.
- **`Preferences`** — single row (`id: "singleton"`) holding standing diet/restriction/nutrition-goal filters; single-user, so this is config, not a per-account table.

### Grocery list consolidation strategy

Combining ingredient amounts across recipes needs unit handling, and it won't always be exact:

- Merge automatically when `ingredientId` + `unit` match exactly (scaled by each `MealPlanEntry.people` vs. `Recipe.servings`).
- Convert and merge within a compatible unit family (volume↔volume: tsp/tbsp/cup; weight↔weight: g/oz/lb) via a small static conversion table.
- When units aren't reconcilable (e.g., "1 clove garlic" + "2 tsp minced garlic"), list them as separate line items under the same ingredient rather than guessing a conversion.
- Group the final list by `Ingredient.category` for a shopping-friendly layout.

Implemented as `src/lib/groceryList.ts#buildGroceryList`, a pure function over plain data — see the Grocery list section below for how it's wired into the actual page.

### Pantry-matching strategy

Rank recipes by `(matched ingredient count) / (total ingredient count)`, where "matched" means the recipe's `ingredientId` appears in the user's `PantryItem` list — no unit/quantity comparison needed for a first pass (having *some* flour is enough to count as a match; whether it's *enough* flour is a stretch goal, not required for MVP).

### Weekly planner (`/planner`)

Server-rendered grid (7 days × `MealSlot`), navigated by a `?week=YYYY-MM-DD` search param holding that week's Monday (`src/lib/week.ts#mondayOf` normalizes whatever date comes in, so a stray non-Monday value in the URL can't desync the grid from the stored `MealPlan.weekStart`). No client-side state: every mutation is a plain `<form action={serverAction}>` POST (`planner/actions.ts`), so it works with JS disabled and there's no client/server state to keep in sync — `revalidatePath("/planner")` after each mutation is what makes the next render current. `getOrCreateMealPlan` (`src/lib/mealPlan.ts`) lazily creates the week's `MealPlan` row on first visit/mutation rather than requiring one to exist upfront.

This page intentionally overrides the app's default narrow (`max-w-3xl`) reading-width layout with `max-w-[2200px]` — a 7-column grid needs real width, and clipping it to a text-reading measure just forces horizontal scrolling. If the grid ever needs to work well on narrow/mobile viewports, that's a real redesign (e.g. one-day-at-a-time view), not a matter of shrinking the max-width back down.

There's no explicit "save" action anywhere in the planner — every add/update/remove is already a committed database write via its server action, so "saving" isn't a distinct step the UI needs to expose. The planner page says this outright ("Changes save automatically") specifically so that isn't ambiguous to someone used to apps with a separate save step.

### Grocery list (`/planner/grocery-list`)

Implements the consolidation strategy described above. `src/lib/groceryList.ts#buildGroceryList` is a pure function over plain `PlannedEntry[]` data (no Prisma types) — the page (`planner/grocery-list/page.tsx`) does the Prisma fetch (`MealPlan` for the `?week=` param, with `entries.recipe.ingredients.ingredient` included) and maps it into that plain shape before calling it, which is what keeps the merge/convert logic itself testable without a database. Verified by hand against real seeded data (see git history for the exact numbers) rather than an automated test — there's no test runner set up in this repo yet; if one gets added, this function is the natural first thing to cover, since it's already shaped for it.

Unlike the planner grid, this page doesn't call `getOrCreateMealPlan` — it only reads (`prisma.mealPlan.findUnique`), so *viewing* an empty week's grocery list doesn't create a database row as a side effect the way visiting `/planner` does.

### Recipe detail (`/recipes/[id]`)

Plain read-only page — title, cuisine/servings, diet tags, nutrition stats, ingredients (amount/unit/note or "to taste"), instructions (steps split on `\n`, see `Recipe.instructions`' storage format above). Recipe titles link here from both the home page list and the planner grid's filled cells. `notFound()` on a missing id rather than a manual 404 render, per Next.js convention.

### Filtered dish search (`/`)

The home page's filter form is a plain `<form method="get">` — no client JS, no server action, just a GET request whose query string (`?diet=...&diet=...&cuisine=&minCalories=&maxCalories=&minProtein=`) the page reads via `searchParams` and re-renders around, the same pattern as the planner's `?week=`. `src/lib/recipeSearch.ts` splits this into two pure functions kept separate on purpose: `parseRecipeFilters` (query params → typed `RecipeFilters`) and `buildRecipeWhere` (`RecipeFilters` → `Prisma.RecipeWhereInput`) — parsing has no Prisma dependency and is trivially testable, and keeping the `where`-building out of the page component means the filter logic isn't tangled with data fetching.

**Multiple selected diet tags are AND'd, not OR'd** — checking both "vegetarian" and "gluten-free" returns recipes that are both, not recipes that are either. This is the only sane reading for dietary *restrictions* (the reason someone filters by diet in the first place), even though it means the result set shrinks, sometimes to empty, as you add more tags. Verified against the seed data by hand: vegetarian+gluten-free returns exactly the 8 recipes carrying both tags, not the larger set carrying either one.

Adding this turned the home page from statically prerendered to dynamic (`searchParams` forces that per Next.js — see the Deployment section's build output before this change), which is fine here since the page was always going to need live data once there's any per-request variation; it's mentioned because it's a real behavior change from the initial scaffold's `○ /` (static) route, not because it needs fixing.

## Key conventions

- **Single-user, no auth.** There's exactly one `Preferences` row and no user/account model anywhere. Don't add a `userId` column speculatively — if multi-user ever becomes a real requirement, that's a deliberate migration, not a default to design around now.
- **Prisma client access:** always import `{ prisma }` from `@/lib/prisma`; never instantiate `PrismaClient` ad hoc (see the driver-adapter note above).
- **Seed data vs. custom data:** never write code that deletes or mutates `RecipeSource.CUSTOM` recipes from a seeding/reset path. Only `SEED`-sourced rows are disposable.
- **`prisma/seed-data.ts`** is plain data (no DB calls) so it can be imported and asserted on in tests independent of `seed.ts`'s upsert logic.
- **Styling:** Tailwind v4, configured via `postcss.config.mjs` (no separate `tailwind.config.*` — v4 uses CSS-based config in `src/app/globals.css`).
- **`AGENTS.md`** is regenerated by `next dev` itself (see the file) — don't hand-edit its content beyond what's already there; `CLAUDE.md` imports it via `@AGENTS.md` so both stay in sync automatically.
- **Visual verification:** `playwright` is a devDependency specifically so UI changes can be screenshotted and actually looked at, not just typechecked/linted — the pre-installed Chromium lives at `/opt/pw-browsers/chromium` (pass it as `executablePath`; don't run `playwright install`). When scripting interactions against the dev server, wait for the specific UI change the mutation causes (e.g. a "Remove" button appearing in that grid cell) rather than `networkidle` — `revalidatePath` triggers a client-side re-render that can land after the network goes idle, and clicking through that window drops the interaction. A fresh `page.goto` is unaffected by this and is the reliable way to confirm what's actually persisted.

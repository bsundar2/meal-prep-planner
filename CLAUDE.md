@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project does

A single-user webapp for weekly meal prep planning, built around one shared recipe/ingredient data model that powers three features:

1. **Weekly meal plan → grocery list.** Build out a week (day × meal slot → recipe, scaled to a number of people), then consolidate ingredients across every planned meal into one shopping list, grouped by grocery category.
2. **Filtered dish search.** Search the recipe catalog by diet tags (vegetarian, vegan, gluten-free, ...), cuisine, and nutrition ranges (calories/protein per serving).
3. **Pantry-based suggestions.** Give it a list of ingredients you have on hand; it ranks recipes by how many of their ingredients you already have, so you can find something to cook with what's in the fridge.

## Recipe data: seeded catalog + live Spoonacular search

Two sources feed the `Recipe` table, distinguished by `RecipeSource`. `prisma/seed-data.ts` is a hand-curated set of ~20 recipes (structured ingredients, rough nutrition estimates, diet tags, cuisines) spanning breakfast/lunch/dinner and multiple diets — originally the *only* source (a live API was considered and deliberately dropped early on), now the offline-always-available baseline that search/filtering/consolidation/pantry-matching can be tested against with zero network dependency. `prisma/seed.ts` loads it via `RecipeSource.SEED`; user-entered recipes get `RecipeSource.CUSTOM` and are never touched by re-seeding. Expand `seed-data.ts` directly to grow the mock catalog.

On top of that, `RecipeSource.SPOONACULAR` recipes are fetched live from the Spoonacular API and cached into the same table on first view — see "External recipe API (Spoonacular)" below.

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
| `.env`'s `SPOONACULAR_API_KEY` | Optional — enables live Spoonacular search on the home page (see "External recipe API" below). Everything works without it; it's just off. |

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
    pantryMatch.ts        # rankRecipesByPantry — pure matched/total ingredient ranking
  generated/prisma/    # Prisma client output — gitignored, regenerate with `npm run db:generate`
  app/                 # Next.js App Router pages/route handlers
    page.tsx             # recipe list + filter form (narrow, max-w-3xl reading-width layout)
    recipes/[id]/
      page.tsx            # read-only recipe detail
    pantry/
      page.tsx            # pantry management + ranked "recipes you can make" (force-dynamic — see note below)
      actions.ts           # "use server" mutations: addPantryItem, removePantryItem
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

Rank recipes by `(matched ingredient count) / (total ingredient count)`, where "matched" means the recipe's `ingredientId` appears in the user's `PantryItem` list — no unit/quantity comparison needed for a first pass (having *some* flour is enough to count as a match; whether it's *enough* flour is a stretch goal, not required for MVP). Implemented as `src/lib/pantryMatch.ts#rankRecipesByPantry` — see the Pantry-based suggestions section below.

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

### External recipe API (Spoonacular)

`src/lib/spoonacular.ts` is a thin client for [Spoonacular](https://spoonacular.com/food-api); `SPOONACULAR_API_KEY` is optional — everything works without it, this section's code just no-ops (`isSpoonacularConfigured()` gates every call site). Free tier is 150 points/day, so the design leans quota-conservative throughout:

- **Search is opt-in, not automatic.** The home page only calls `searchSpoonacularRecipes` when `hasActiveFilters(filters)` is true — a plain unfiltered visit to `/` never touches the API, only an actual search does.
- **Search results carry no nutrition.** Requesting nutrition in `complexSearch` costs extra points per Spoonacular's own pricing; results are just `{externalId, title, imageUrl}`. Full detail (ingredients, instructions, nutrition) is only fetched once you actually open one.
- **Caching makes "once" literal.** `src/lib/cacheExternalRecipe.ts#cacheSpoonacularRecipe` looks up `Recipe` by the `(source, externalId)` unique constraint first and only calls `getSpoonacularRecipeDetail` (the expensive `/recipes/{id}/information` call) on a genuine cache miss. The resolver route `recipes/external/[externalId]/page.tsx` is the only thing that calls it — it caches (or reuses) the recipe and redirects to the normal `/recipes/[id]` detail page, so a Spoonacular recipe and a local one look identical to everything downstream (the planner, grocery list, pantry matching) once it's been viewed once. There's no "sync" or refresh path — a cached Spoonacular recipe is a permanent local copy from that point on, same as a seed recipe.

**Diet tags split across two different Spoonacular parameters, not one.** `diet` is Spoonacular's own recipe-level classification (supports multiple values ANDed via commas, which is what our own AND-multiple-diet-tags semantics needed); `intolerances` actually analyzes ingredient content, which is the correct mechanism for genuine restrictions like gluten/dairy rather than a loose category tag. So `vegetarian`/`vegan`/`keto`→`ketogenic`/`pescatarian`→`pescetarian` (note Spoonacular's spelling) go through `diet`, while `gluten-free`→`gluten`/`dairy-free`→`dairy` go through `intolerances`. The reverse mapping (`REVERSE_DIET` in `spoonacular.ts`) is used when caching a fetched recipe back into our own `DietTag` vocabulary from Spoonacular's `diets` response array — only tags we recognize get kept; Spoonacular's diet list is broader than ours (paleo, whole30, low FODMAP, ...) and those are silently dropped rather than polluting `DietTag` with one-off values nothing else filters by.

The exact request/response shapes (`complexSearch` params, `extendedIngredients`, `nutrition.nutrients`) were sourced from Spoonacular's public docs and third-party references rather than fetched directly (spoonacular.com is blocked by this dev sandbox's network egress policy, and so is the deployed app's own domain — that policy blocks arbitrary outbound domains generally, not Spoonacular specifically). Live-verified on the deployed Render app instead, with a real key: `complexSearch` returns real results into the "From Spoonacular" section, and opening one correctly caches it (ingredients, instructions, nutrition all populated) and lands on a normal `/recipes/[id]` page. If Spoonacular ever changes these shapes, `spoonacular.ts` is the one place that needs to change; nothing downstream (the caching function, the pages) knows or cares that the data came from an HTTP API rather than the seed script.

**Not wired into `/pantry` yet.** Spoonacular's `findByIngredients` endpoint would extend pantry-based suggestions the same way `complexSearch` extended dish search, but that's a separate follow-up — the local `rankRecipesByPantry` logic doesn't depend on it and isn't affected by its absence.

### Pantry-based suggestions (`/pantry`)

Implements the pantry-matching strategy described above. `src/lib/pantryMatch.ts#rankRecipesByPantry` is a pure function (same shape as `groceryList.ts`/`recipeSearch.ts` — plain data in, no Prisma types) that scores every recipe by `matchedCount / totalCount` against a `Set` of pantry ingredient ids, filters out zero-match recipes, and sorts by ratio desc, then matched-count desc, then title asc for deterministic tie-breaking. Verified against real seeded data end to end (not just the pure function in isolation) — 9 common pantry items correctly surfaced 19 of 20 recipes ranked, with the one 0-match recipe (a recipe sharing none of those 9 ingredients) correctly excluded.

Adding an ingredient (`addPantryItem` in `pantry/actions.ts`) upserts the `Ingredient` by name first — same `connectOrCreate`-by-name identity `RecipeIngredient` relies on — so typing an ingredient that's already used in a recipe (matched via a `<datalist>` of existing names, though free text works too) reuses that row rather than creating a duplicate; this is exactly what makes id-based matching against recipes work at all. Input is lowercased before the upsert since seed ingredient names are stored lowercase (see `seed-data.ts`) and matching is by exact id, not fuzzy text.

**This page needs `export const dynamic = "force-dynamic"`, unlike the other pages.** Every other page either takes `searchParams` (home, planner, grocery-list) or reads a route param (`recipes/[id]`), either of which forces Next.js into per-request dynamic rendering automatically. `/pantry` does neither — it's a plain server component whose only per-request variation comes from `PantryItem` rows that change via server actions — so without the explicit override, Next.js has a real static-rendering candidate on its hands despite the page depending on frequently-mutated data, and `revalidatePath("/pantry")` alone was not reliably enough to keep it current (reproduced during development: repeated navigations returned a stale, smaller match list). Explicit `force-dynamic` removes the ambiguity rather than depending on revalidation timing.

## Key conventions

- **Single-user, no auth.** There's exactly one `Preferences` row and no user/account model anywhere. Don't add a `userId` column speculatively — if multi-user ever becomes a real requirement, that's a deliberate migration, not a default to design around now.
- **Prisma client access:** always import `{ prisma }` from `@/lib/prisma`; never instantiate `PrismaClient` ad hoc (see the driver-adapter note above).
- **Seed data vs. custom data:** never write code that deletes or mutates `RecipeSource.CUSTOM` recipes from a seeding/reset path. Only `SEED`-sourced rows are disposable.
- **`prisma/seed-data.ts`** is plain data (no DB calls) so it can be imported and asserted on in tests independent of `seed.ts`'s upsert logic.
- **Styling:** Tailwind v4, configured via `postcss.config.mjs` (no separate `tailwind.config.*` — v4 uses CSS-based config in `src/app/globals.css`).
- **`AGENTS.md`** is regenerated by `next dev` itself (see the file) — don't hand-edit its content beyond what's already there; `CLAUDE.md` imports it via `@AGENTS.md` so both stay in sync automatically.
- **Visual verification:** `playwright` is a devDependency specifically so UI changes can be screenshotted and actually looked at, not just typechecked/linted — the pre-installed Chromium lives at `/opt/pw-browsers/chromium` (pass it as `executablePath`; don't run `playwright install`). When scripting interactions against the dev server, wait for the specific UI change the mutation causes (e.g. a "Remove" button appearing in that grid cell) rather than `networkidle` — `revalidatePath` triggers a client-side re-render that can land after the network goes idle, and clicking through that window drops the interaction. A fresh `page.goto` is unaffected by this and is the reliable way to confirm what's actually persisted.

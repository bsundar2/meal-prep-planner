# meal-prep-planner

A single-user webapp for weekly meal prep planning:

- **Weekly meal plan → grocery list** — plan a week of meals and get a consolidated shopping list across all of them.
- **Filtered dish search** — find recipes by diet, cuisine, and nutrition goals.
- **Pantry-based suggestions** — tell it what you have on hand, get recipes ranked by how much of it you can use.

See [`CLAUDE.md`](./CLAUDE.md) for the full architecture, data model, and conventions.

## Getting started (local)

Requires a Postgres database — set `DATABASE_URL` in `.env` to point at one (a local instance, or a free one from Render/Supabase/etc).

```bash
npm install
npm run db:migrate   # applies the schema
npm run db:seed      # loads the curated mock recipe catalog
npm run dev            # http://localhost:3000
```

## Deploying (Render)

This repo includes a `render.yaml` Blueprint. On [Render](https://render.com): **New → Blueprint**, point it at this repo, review, and apply. It provisions a free Postgres database and a free web service wired together, and every deploy runs migrations + reseeds the mock recipe catalog automatically. See `CLAUDE.md` for details.

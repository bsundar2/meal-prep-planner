# meal-prep-planner

A single-user webapp for weekly meal prep planning:

- **Weekly meal plan → grocery list** — plan a week of meals and get a consolidated shopping list across all of them.
- **Filtered dish search** — find recipes by diet, cuisine, and nutrition goals.
- **Pantry-based suggestions** — tell it what you have on hand, get recipes ranked by how much of it you can use.

See [`CLAUDE.md`](./CLAUDE.md) for the full architecture, data model, and conventions.

## Getting started

```bash
npm install
npm run db:migrate   # creates dev.db and applies the schema
npm run db:seed      # loads the curated mock recipe catalog
npm run dev           # http://localhost:3000
```

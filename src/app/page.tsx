import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  buildRecipeWhere,
  hasActiveFilters,
  parseRecipeFilters,
  type RecipeSearchParams,
} from "@/lib/recipeSearch";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<RecipeSearchParams>;
}) {
  const rawParams = await searchParams;
  const filters = parseRecipeFilters(rawParams);
  const filtersActive = hasActiveFilters(filters);

  const [recipes, dietTags, cuisineRows] = await Promise.all([
    prisma.recipe.findMany({
      where: buildRecipeWhere(filters),
      orderBy: { title: "asc" },
      include: { dietTags: { include: { dietTag: true } } },
    }),
    prisma.dietTag.findMany({ orderBy: { name: "asc" } }),
    prisma.recipe.findMany({
      where: { cuisine: { not: null } },
      distinct: ["cuisine"],
      select: { cuisine: true },
      orderBy: { cuisine: "asc" },
    }),
  ]);
  const cuisines = cuisineRows.map((r) => r.cuisine).filter((c): c is string => c != null);

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-16 font-sans dark:bg-black">
      <main className="mx-auto flex max-w-3xl flex-col gap-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Meal Prep Planner
            </h1>
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">
              {recipes.length} of {filtersActive ? "matching" : "total"} recipes
              {filtersActive ? " for your filters" : " loaded from the database"}.
            </p>
          </div>
          <Link
            href="/planner"
            className="shrink-0 rounded-md bg-zinc-950 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            Weekly Planner →
          </Link>
        </div>

        <form
          method="get"
          className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div>
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Diet
            </span>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5">
              {dietTags.map((tag) => (
                <label
                  key={tag.id}
                  className="flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300"
                >
                  <input
                    type="checkbox"
                    name="diet"
                    value={tag.name}
                    defaultChecked={filters.dietTags.includes(tag.name)}
                  />
                  {tag.name}
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Cuisine
              </span>
              <select
                name="cuisine"
                defaultValue={filters.cuisine ?? ""}
                className="rounded border border-zinc-300 bg-white px-2 py-1 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"
              >
                <option value="">Any</option>
                {cuisines.map((cuisine) => (
                  <option key={cuisine} value={cuisine}>
                    {cuisine}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Min calories
              </span>
              <input
                type="number"
                name="minCalories"
                min={0}
                defaultValue={filters.minCalories ?? ""}
                className="w-24 rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Max calories
              </span>
              <input
                type="number"
                name="maxCalories"
                min={0}
                defaultValue={filters.maxCalories ?? ""}
                className="w-24 rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Min protein (g)
              </span>
              <input
                type="number"
                name="minProtein"
                min={0}
                defaultValue={filters.minProtein ?? ""}
                className="w-24 rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>

            <button
              type="submit"
              className="rounded-md bg-zinc-950 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              Filter
            </button>
            {filtersActive && (
              <Link href="/" className="text-sm text-zinc-500 hover:underline">
                Clear
              </Link>
            )}
          </div>
        </form>

        <ul className="flex flex-col gap-3">
          {recipes.map((recipe) => (
            <li
              key={recipe.id}
              className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex items-baseline justify-between gap-4">
                <Link
                  href={`/recipes/${recipe.id}`}
                  className="font-medium text-zinc-950 hover:underline dark:text-zinc-50"
                >
                  {recipe.title}
                </Link>
                <span className="text-sm text-zinc-500">
                  {recipe.cuisine} · serves {recipe.servings}
                </span>
              </div>
              {recipe.dietTags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {recipe.dietTags.map(({ dietTag }) => (
                    <span
                      key={dietTag.id}
                      className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400"
                    >
                      {dietTag.name}
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
          {recipes.length === 0 && (
            <li className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-zinc-500 dark:border-zinc-700">
              No recipes match your filters.
            </li>
          )}
        </ul>
      </main>
    </div>
  );
}

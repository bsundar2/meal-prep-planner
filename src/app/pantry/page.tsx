import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { rankRecipesByPantry } from "@/lib/pantryMatch";
import { addPantryItem, removePantryItem } from "./actions";

// No searchParams/other dynamic API here, unlike the other pages, so
// Next.js could otherwise treat this as a static/cacheable route despite
// depending on PantryItem rows that change on every add/remove. Force it
// dynamic rather than relying solely on the actions' revalidatePath calls.
export const dynamic = "force-dynamic";

export default async function PantryPage() {
  const [pantryItems, allIngredients, recipes] = await Promise.all([
    prisma.pantryItem.findMany({
      include: { ingredient: true },
      orderBy: { ingredient: { name: "asc" } },
    }),
    prisma.ingredient.findMany({ orderBy: { name: "asc" } }),
    prisma.recipe.findMany({
      include: { ingredients: { include: { ingredient: true } } },
    }),
  ]);

  const pantryIngredientIds = new Set(pantryItems.map((item) => item.ingredientId));

  const matches = rankRecipesByPantry(
    recipes.map((recipe) => ({
      recipeId: recipe.id,
      title: recipe.title,
      ingredients: recipe.ingredients.map((ri) => ({
        ingredientId: ri.ingredientId,
        ingredientName: ri.ingredient.name,
      })),
    })),
    pantryIngredientIds
  );

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-16 font-sans dark:bg-black">
      <main className="mx-auto flex max-w-2xl flex-col gap-10">
        <div>
          <Link href="/" className="text-sm text-zinc-500 hover:underline">
            ← Recipes
          </Link>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            Pantry
          </h1>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">
            What you have on hand, and what you can make with it.
          </p>
        </div>

        <section>
          <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Your pantry</h2>

          <form
            action={addPantryItem}
            className="mt-3 flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Ingredient
              </span>
              <input
                type="text"
                name="ingredientName"
                list="ingredient-options"
                required
                placeholder="e.g. garlic"
                className="w-48 rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
              />
              <datalist id="ingredient-options">
                {allIngredients.map((ing) => (
                  <option key={ing.id} value={ing.name} />
                ))}
              </datalist>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Amount
              </span>
              <input
                type="number"
                name="amount"
                min={0}
                step="any"
                className="w-20 rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Unit
              </span>
              <input
                type="text"
                name="unit"
                placeholder="cup, lb, ..."
                className="w-24 rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <button
              type="submit"
              className="rounded-md bg-zinc-950 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              Add
            </button>
          </form>

          {pantryItems.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">
              Nothing added yet — add what you have and recipe suggestions will show up below.
            </p>
          ) : (
            <ul className="mt-3 flex flex-wrap gap-2">
              {pantryItems.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white py-1 pl-3 pr-1.5 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <span className="text-zinc-900 dark:text-zinc-100">
                    {item.ingredient.name}
                    {item.amount != null && (
                      <span className="text-zinc-500"> · {item.amount}{item.unit ? ` ${item.unit}` : ""}</span>
                    )}
                  </span>
                  <form action={removePantryItem}>
                    <input type="hidden" name="pantryItemId" value={item.id} />
                    <button
                      type="submit"
                      aria-label={`Remove ${item.ingredient.name}`}
                      className="rounded-full px-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-red-500 dark:hover:bg-zinc-900"
                    >
                      ×
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            Recipes you can make
          </h2>

          {matches.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">
              {pantryItems.length === 0
                ? "Add some ingredients above to see suggestions."
                : "No recipes share an ingredient with your pantry yet."}
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {matches.map((match) => (
                <li
                  key={match.recipeId}
                  className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <Link
                      href={`/recipes/${match.recipeId}`}
                      className="font-medium text-zinc-950 hover:underline dark:text-zinc-50"
                    >
                      {match.title}
                    </Link>
                    <span className="shrink-0 text-sm text-zinc-500">
                      {match.matchedCount}/{match.totalCount} ingredients
                    </span>
                  </div>
                  {match.missingIngredients.length > 0 && (
                    <p className="mt-1.5 text-sm text-zinc-500">
                      Missing: {match.missingIngredients.join(", ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

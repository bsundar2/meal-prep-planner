import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { buildGroceryList, type PlannedEntry } from "@/lib/groceryList";
import { formatWeekRangeLabel, mondayOf, parseISODate, toISODate } from "@/lib/week";

const CATEGORY_LABELS: Record<string, string> = {
  produce: "Produce",
  meat: "Meat",
  seafood: "Seafood",
  dairy: "Dairy",
  grains: "Grains",
  pantry: "Pantry",
  spices: "Spices",
  other: "Other",
};

export default async function GroceryListPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const weekStart = week ? mondayOf(parseISODate(week)) : mondayOf(new Date());
  const weekStartISO = toISODate(weekStart);

  const mealPlan = await prisma.mealPlan.findUnique({
    where: { weekStart },
    include: {
      entries: {
        include: {
          recipe: {
            include: { ingredients: { include: { ingredient: true } } },
          },
        },
      },
    },
  });

  const plannedEntries: PlannedEntry[] = (mealPlan?.entries ?? []).map((entry) => ({
    people: entry.people,
    recipeServings: entry.recipe.servings,
    ingredients: entry.recipe.ingredients.map((ri) => ({
      ingredientId: ri.ingredientId,
      ingredientName: ri.ingredient.name,
      category: ri.ingredient.category,
      amount: ri.amount,
      unit: ri.unit,
    })),
  }));

  const sections = buildGroceryList(plannedEntries);
  const totalLines = sections.reduce((sum, s) => sum + s.lines.length, 0);

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-16 font-sans dark:bg-black">
      <main className="mx-auto flex max-w-2xl flex-col gap-6">
        <div>
          <Link href={`/planner?week=${weekStartISO}`} className="text-sm text-zinc-500 hover:underline">
            ← Weekly Planner
          </Link>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            Grocery List
          </h1>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">
            Week of {formatWeekRangeLabel(weekStart)}
          </p>
        </div>

        {totalLines === 0 ? (
          <p className="text-zinc-500 dark:text-zinc-400">
            No meals planned for this week yet — assign recipes in the{" "}
            <Link href={`/planner?week=${weekStartISO}`} className="underline">
              weekly planner
            </Link>{" "}
            and the grocery list will build itself from them.
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            {sections.map((section) => (
              <section key={section.category}>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                  {CATEGORY_LABELS[section.category] ?? section.category}
                </h2>
                <ul className="mt-2 divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
                  {section.lines.map((line) => (
                    <li
                      key={line.ingredientId}
                      className="flex items-baseline justify-between gap-4 px-4 py-2.5"
                    >
                      <span className="text-zinc-900 dark:text-zinc-100">
                        {line.ingredientName}
                      </span>
                      <span className="shrink-0 text-sm text-zinc-500">
                        {line.amount != null && line.unit != null
                          ? `${formatAmount(line.amount)} ${line.unit}`
                          : "to taste"}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function formatAmount(amount: number): string {
  return Number.isInteger(amount) ? `${amount}` : amount.toFixed(2).replace(/\.?0+$/, "");
}

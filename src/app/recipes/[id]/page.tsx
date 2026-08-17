import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const recipe = await prisma.recipe.findUnique({
    where: { id },
    include: {
      ingredients: { include: { ingredient: true } },
      dietTags: { include: { dietTag: true } },
    },
  });

  if (!recipe) notFound();

  const steps = recipe.instructions.split("\n").filter(Boolean);

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-16 font-sans dark:bg-black">
      <main className="mx-auto flex max-w-3xl flex-col gap-8">
        <div>
          <Link href="/" className="text-sm text-zinc-500 hover:underline">
            ← Recipes
          </Link>
          <div className="mt-1 flex items-baseline justify-between gap-4">
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              {recipe.title}
            </h1>
            <span className="shrink-0 text-sm text-zinc-500">
              {recipe.cuisine} · serves {recipe.servings}
            </span>
          </div>
          {recipe.dietTags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
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
        </div>

        {(recipe.caloriesPerServing != null ||
          recipe.proteinPerServing != null ||
          recipe.carbsPerServing != null ||
          recipe.fatPerServing != null) && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {recipe.caloriesPerServing != null && (
              <NutritionStat label="Calories" value={`${recipe.caloriesPerServing}`} />
            )}
            {recipe.proteinPerServing != null && (
              <NutritionStat label="Protein" value={`${recipe.proteinPerServing}g`} />
            )}
            {recipe.carbsPerServing != null && (
              <NutritionStat label="Carbs" value={`${recipe.carbsPerServing}g`} />
            )}
            {recipe.fatPerServing != null && (
              <NutritionStat label="Fat" value={`${recipe.fatPerServing}g`} />
            )}
          </div>
        )}

        <section>
          <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Ingredients</h2>
          <ul className="mt-3 flex flex-col gap-1.5">
            {recipe.ingredients.map((ri) => (
              <li key={ri.id} className="text-zinc-700 dark:text-zinc-300">
                <span className="text-zinc-500 dark:text-zinc-500">
                  {ri.amount != null && ri.unit != null
                    ? `${formatAmount(ri.amount)} ${ri.unit}`
                    : "to taste"}
                </span>{" "}
                {ri.ingredient.name}
                {ri.note && <span className="text-zinc-400"> ({ri.note})</span>}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Instructions</h2>
          <ol className="mt-3 flex flex-col gap-3">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-3 text-zinc-700 dark:text-zinc-300">
                <span className="font-medium text-zinc-400">{i + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </div>
  );
}

function NutritionStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 text-center dark:border-zinc-800 dark:bg-zinc-950">
      <div className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">{value}</div>
      <div className="text-xs text-zinc-500">{label}</div>
    </div>
  );
}

function formatAmount(amount: number): string {
  return Number.isInteger(amount) ? `${amount}` : amount.toFixed(2).replace(/\.?0+$/, "");
}

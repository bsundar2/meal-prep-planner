import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function Home() {
  const recipes = await prisma.recipe.findMany({
    orderBy: { title: "asc" },
    include: { dietTags: { include: { dietTag: true } } },
  });

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-16 font-sans dark:bg-black">
      <main className="mx-auto flex max-w-3xl flex-col gap-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Meal Prep Planner
            </h1>
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">
              {recipes.length} recipes loaded from the database.
            </p>
          </div>
          <Link
            href="/planner"
            className="shrink-0 rounded-md bg-zinc-950 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            Weekly Planner →
          </Link>
        </div>
        <ul className="flex flex-col gap-3">
          {recipes.map((recipe) => (
            <li
              key={recipe.id}
              className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex items-baseline justify-between gap-4">
                <span className="font-medium text-zinc-950 dark:text-zinc-50">
                  {recipe.title}
                </span>
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
        </ul>
      </main>
    </div>
  );
}

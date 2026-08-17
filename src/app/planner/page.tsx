import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getOrCreateMealPlan } from "@/lib/mealPlan";
import {
  DAY_LABELS,
  MEAL_SLOTS,
  addDays,
  formatDayLabel,
  formatWeekRangeLabel,
  mealSlotLabel,
  mondayOf,
  toISODate,
} from "@/lib/week";
import { assignRecipe, removeEntry, updatePeople } from "./actions";

export default async function PlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const weekStart = week ? mondayOf(new Date(`${week}T00:00:00.000Z`)) : mondayOf(new Date());
  const weekStartISO = toISODate(weekStart);
  const prevWeekISO = toISODate(addDays(weekStart, -7));
  const nextWeekISO = toISODate(addDays(weekStart, 7));

  const [mealPlan, recipes] = await Promise.all([
    getOrCreateMealPlan(weekStartISO),
    prisma.recipe.findMany({ orderBy: { title: "asc" } }),
  ]);

  const entryByCell = new Map(
    mealPlan.entries.map((entry) => [`${entry.dayOfWeek}-${entry.mealSlot}`, entry])
  );

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-12 font-sans dark:bg-black">
      <main className="mx-auto flex max-w-[2200px] flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/" className="text-sm text-zinc-500 hover:underline">
              ← Recipes
            </Link>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Weekly Planner
            </h1>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">
              Week of {formatWeekRangeLabel(weekStart)}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/planner?week=${prevWeekISO}`}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              ← Previous week
            </Link>
            <Link
              href={`/planner?week=${toISODate(mondayOf(new Date()))}`}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              This week
            </Link>
            <Link
              href={`/planner?week=${nextWeekISO}`}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              Next week →
            </Link>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-28 border-b border-zinc-200 bg-zinc-100 p-3 text-left font-medium text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                  Meal
                </th>
                {DAY_LABELS.map((label, dayOfWeek) => (
                  <th
                    key={label}
                    className="border-b border-l border-zinc-200 bg-zinc-100 p-3 text-left font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
                  >
                    {label}
                    <div className="font-normal text-zinc-400">
                      {formatDayLabel(addDays(weekStart, dayOfWeek))}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MEAL_SLOTS.map((slot) => (
                <tr key={slot}>
                  <th className="w-28 border-b border-zinc-200 bg-zinc-50 p-3 text-left align-top font-medium text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                    {mealSlotLabel(slot)}
                  </th>
                  {DAY_LABELS.map((_, dayOfWeek) => {
                    const entry = entryByCell.get(`${dayOfWeek}-${slot}`);
                    return (
                      <td
                        key={dayOfWeek}
                        className="min-w-[180px] border-b border-l border-zinc-200 p-2 align-top dark:border-zinc-800"
                      >
                        {entry ? (
                          <div className="flex flex-col gap-2 rounded-md bg-white p-2 shadow-sm dark:bg-zinc-900">
                            <span className="font-medium text-zinc-950 dark:text-zinc-50">
                              {entry.recipe.title}
                            </span>
                            <form action={updatePeople} className="flex items-center gap-1.5">
                              <input type="hidden" name="entryId" value={entry.id} />
                              <label className="text-xs text-zinc-500">People</label>
                              <input
                                type="number"
                                name="people"
                                min={1}
                                defaultValue={entry.people}
                                className="w-14 rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-950"
                              />
                              <button
                                type="submit"
                                className="rounded border border-zinc-300 px-1.5 py-0.5 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                              >
                                Update
                              </button>
                            </form>
                            <form action={removeEntry}>
                              <input type="hidden" name="entryId" value={entry.id} />
                              <button
                                type="submit"
                                className="text-xs text-red-500 hover:underline"
                              >
                                Remove
                              </button>
                            </form>
                          </div>
                        ) : (
                          <form action={assignRecipe} className="flex flex-col gap-1.5">
                            <input type="hidden" name="weekStart" value={weekStartISO} />
                            <input type="hidden" name="dayOfWeek" value={dayOfWeek} />
                            <input type="hidden" name="mealSlot" value={slot} />
                            <select
                              name="recipeId"
                              defaultValue=""
                              className="rounded border border-zinc-300 bg-white px-1.5 py-1 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"
                            >
                              <option value="" disabled>
                                Add recipe…
                              </option>
                              {recipes.map((recipe) => (
                                <option key={recipe.id} value={recipe.id}>
                                  {recipe.title}
                                </option>
                              ))}
                            </select>
                            <div className="flex items-center gap-1.5">
                              <label className="text-xs text-zinc-500">People</label>
                              <input
                                type="number"
                                name="people"
                                min={1}
                                defaultValue={2}
                                className="w-14 rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-950"
                              />
                              <button
                                type="submit"
                                className="rounded border border-zinc-300 px-1.5 py-0.5 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                              >
                                Add
                              </button>
                            </div>
                          </form>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

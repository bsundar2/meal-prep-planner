"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getOrCreateMealPlan } from "@/lib/mealPlan";
import type { MealSlotValue } from "@/lib/week";

export async function assignRecipe(formData: FormData) {
  const weekStart = String(formData.get("weekStart"));
  const dayOfWeek = Number(formData.get("dayOfWeek"));
  const mealSlot = String(formData.get("mealSlot")) as MealSlotValue;
  const recipeId = String(formData.get("recipeId"));
  const people = Math.max(1, Number(formData.get("people")) || 1);

  if (!recipeId) return;

  const mealPlan = await getOrCreateMealPlan(weekStart);

  await prisma.mealPlanEntry.upsert({
    where: {
      mealPlanId_dayOfWeek_mealSlot: {
        mealPlanId: mealPlan.id,
        dayOfWeek,
        mealSlot,
      },
    },
    update: { recipeId, people },
    create: { mealPlanId: mealPlan.id, dayOfWeek, mealSlot, recipeId, people },
  });

  revalidatePath("/planner");
}

export async function updatePeople(formData: FormData) {
  const entryId = String(formData.get("entryId"));
  const people = Math.max(1, Number(formData.get("people")) || 1);

  await prisma.mealPlanEntry.update({
    where: { id: entryId },
    data: { people },
  });

  revalidatePath("/planner");
}

export async function removeEntry(formData: FormData) {
  const entryId = String(formData.get("entryId"));

  await prisma.mealPlanEntry.delete({ where: { id: entryId } });

  revalidatePath("/planner");
}

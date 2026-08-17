import { prisma } from "@/lib/prisma";
import { parseISODate } from "@/lib/week";

export async function getOrCreateMealPlan(weekStartISO: string) {
  const weekStart = parseISODate(weekStartISO);

  const existing = await prisma.mealPlan.findUnique({
    where: { weekStart },
    include: {
      entries: {
        include: { recipe: true },
      },
    },
  });
  if (existing) return existing;

  try {
    return await prisma.mealPlan.create({
      data: { weekStart },
      include: {
        entries: {
          include: { recipe: true },
        },
      },
    });
  } catch {
    // Lost a race with a concurrent request creating the same week's plan.
    return prisma.mealPlan.findUniqueOrThrow({
      where: { weekStart },
      include: {
        entries: {
          include: { recipe: true },
        },
      },
    });
  }
}

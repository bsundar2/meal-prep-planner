import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import { seedRecipes } from "./seed-data";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log(`Seeding ${seedRecipes.length} recipes...`);

  // Upsert by (title, SEED) rather than delete-and-recreate: a recipe that's
  // already been placed on a meal plan can't be deleted (MealPlanEntry.recipe
  // has no onDelete cascade, by design — see CLAUDE.md), and even where it
  // could, recreating it would silently drop it from the user's plan. This
  // way re-running the seed script is safe regardless of what's been planned.
  for (const recipe of seedRecipes) {
    const existing = await prisma.recipe.findFirst({
      where: { title: recipe.title, source: "SEED" },
    });

    const fields = {
      title: recipe.title,
      source: "SEED" as const,
      servings: recipe.servings,
      cuisine: recipe.cuisine,
      instructions: recipe.instructions.join("\n"),
      caloriesPerServing: recipe.nutrition.calories,
      proteinPerServing: recipe.nutrition.protein,
      carbsPerServing: recipe.nutrition.carbs,
      fatPerServing: recipe.nutrition.fat,
    };
    const dietTagsCreate = recipe.dietTags.map((tagName) => ({
      dietTag: {
        connectOrCreate: {
          where: { name: tagName },
          create: { name: tagName },
        },
      },
    }));
    const ingredientsCreate = recipe.ingredients.map((ing) => ({
      amount: ing.amount,
      unit: ing.unit,
      note: ing.note ?? null,
      ingredient: {
        connectOrCreate: {
          where: { name: ing.name },
          create: { name: ing.name, category: ing.category },
        },
      },
    }));

    if (existing) {
      // Ingredient/diet-tag join rows have no other references, so it's safe
      // to drop and recreate them; the Recipe row itself (and its id) stays
      // put so any MealPlanEntry pointing at it stays valid.
      await prisma.recipeIngredient.deleteMany({ where: { recipeId: existing.id } });
      await prisma.recipeDietTag.deleteMany({ where: { recipeId: existing.id } });
      await prisma.recipe.update({
        where: { id: existing.id },
        data: {
          ...fields,
          dietTags: { create: dietTagsCreate },
          ingredients: { create: ingredientsCreate },
        },
      });
    } else {
      await prisma.recipe.create({
        data: {
          ...fields,
          dietTags: { create: dietTagsCreate },
          ingredients: { create: ingredientsCreate },
        },
      });
    }
  }

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import { seedRecipes } from "./seed-data";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log(`Seeding ${seedRecipes.length} recipes...`);

  // Wipe previously-seeded recipes so this script is safely re-runnable;
  // custom (user-entered) recipes are untouched.
  await prisma.recipe.deleteMany({ where: { source: "SEED" } });

  for (const recipe of seedRecipes) {
    await prisma.recipe.create({
      data: {
        title: recipe.title,
        source: "SEED",
        servings: recipe.servings,
        cuisine: recipe.cuisine,
        instructions: recipe.instructions.join("\n"),
        caloriesPerServing: recipe.nutrition.calories,
        proteinPerServing: recipe.nutrition.protein,
        carbsPerServing: recipe.nutrition.carbs,
        fatPerServing: recipe.nutrition.fat,
        dietTags: {
          create: recipe.dietTags.map((tagName) => ({
            dietTag: {
              connectOrCreate: {
                where: { name: tagName },
                create: { name: tagName },
              },
            },
          })),
        },
        ingredients: {
          create: recipe.ingredients.map((ing) => ({
            amount: ing.amount,
            unit: ing.unit,
            note: ing.note ?? null,
            ingredient: {
              connectOrCreate: {
                where: { name: ing.name },
                create: { name: ing.name, category: ing.category },
              },
            },
          })),
        },
      },
    });
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

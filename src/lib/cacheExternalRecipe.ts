import { prisma } from "@/lib/prisma";
import { getSpoonacularRecipeDetail } from "@/lib/spoonacular";

// Returns the local Recipe.id for a Spoonacular recipe, fetching and caching
// it on first view (see the (source, externalId) unique constraint on
// Recipe) and just returning the existing row on every view after that.
export async function cacheSpoonacularRecipe(externalId: string): Promise<string | null> {
  const existing = await prisma.recipe.findUnique({
    where: { source_externalId: { source: "SPOONACULAR", externalId } },
  });
  if (existing) return existing.id;

  const detail = await getSpoonacularRecipeDetail(externalId);
  if (!detail) return null;

  const recipe = await prisma.recipe.create({
    data: {
      title: detail.title,
      source: "SPOONACULAR",
      externalId: detail.externalId,
      servings: detail.servings,
      cuisine: detail.cuisine,
      instructions: detail.instructions.join("\n"),
      caloriesPerServing:
        detail.caloriesPerServing != null ? Math.round(detail.caloriesPerServing) : null,
      proteinPerServing: detail.proteinPerServing,
      carbsPerServing: detail.carbsPerServing,
      fatPerServing: detail.fatPerServing,
      dietTags: {
        create: detail.dietTagNames.map((name) => ({
          dietTag: { connectOrCreate: { where: { name }, create: { name } } },
        })),
      },
      ingredients: {
        create: detail.ingredients.map((ing) => ({
          amount: ing.amount,
          unit: ing.unit,
          ingredient: {
            connectOrCreate: { where: { name: ing.name }, create: { name: ing.name } },
          },
        })),
      },
    },
  });

  return recipe.id;
}

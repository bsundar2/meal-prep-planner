// Ranks recipes by how much of their ingredient list is already in the
// pantry. Pure function over plain data (no Prisma types) for the same
// reason as groceryList.ts/recipeSearch.ts — see CLAUDE.md.
//
// Strategy (documented in CLAUDE.md before this was built): matchRatio =
// matched / total, where "matched" is presence, not quantity — having
// *some* flour counts as a match regardless of how much the recipe needs.

export type RecipeIngredientRef = {
  ingredientId: string;
  ingredientName: string;
};

export type MatchableRecipe = {
  recipeId: string;
  title: string;
  ingredients: RecipeIngredientRef[];
};

export type PantryMatch = {
  recipeId: string;
  title: string;
  matchedCount: number;
  totalCount: number;
  matchRatio: number;
  missingIngredients: string[];
};

export function rankRecipesByPantry(
  recipes: MatchableRecipe[],
  pantryIngredientIds: ReadonlySet<string>
): PantryMatch[] {
  const matches: PantryMatch[] = recipes.map((recipe) => {
    const missing = recipe.ingredients.filter(
      (ing) => !pantryIngredientIds.has(ing.ingredientId)
    );
    const totalCount = recipe.ingredients.length;
    const matchedCount = totalCount - missing.length;
    return {
      recipeId: recipe.recipeId,
      title: recipe.title,
      matchedCount,
      totalCount,
      matchRatio: totalCount > 0 ? matchedCount / totalCount : 0,
      missingIngredients: missing.map((ing) => ing.ingredientName).sort(),
    };
  });

  return matches
    .filter((m) => m.matchedCount > 0)
    .sort((a, b) => {
      if (b.matchRatio !== a.matchRatio) return b.matchRatio - a.matchRatio;
      if (b.matchedCount !== a.matchedCount) return b.matchedCount - a.matchedCount;
      return a.title.localeCompare(b.title);
    });
}

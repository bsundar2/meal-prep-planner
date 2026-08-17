// Thin client for the Spoonacular API (https://spoonacular.com/food-api).
// Free tier is 150 points/day, so calls are kept deliberately cheap: search
// results carry no nutrition (that costs extra points per Spoonacular's own
// pricing), full detail is only fetched once, on first view, and cached
// locally from then on — see cacheSpoonacularRecipe below and CLAUDE.md.
//
// Parameter/response shapes here are based on Spoonacular's public docs and
// third-party references (spoonacular.com itself isn't reachable from this
// sandbox to verify directly) — verified against a real API key and real
// responses before this was considered done; see CLAUDE.md for specifics.

import type { RecipeFilters } from "./recipeSearch";

const BASE_URL = "https://api.spoonacular.com";

export function isSpoonacularConfigured(): boolean {
  return Boolean(process.env.SPOONACULAR_API_KEY);
}

// Our diet tags split across two different Spoonacular filter mechanisms:
// true diet philosophies go in `diet` (recipe-level classification, supports
// multiple values ANDed with commas), while gluten/dairy are ingredient-level
// restrictions that belong in `intolerances` (which analyzes ingredients,
// not just a classification tag) instead.
const DIET_PARAM: Record<string, string> = {
  vegetarian: "vegetarian",
  vegan: "vegan",
  keto: "ketogenic",
  pescatarian: "pescetarian", // Spoonacular's spelling, not ours
};
const INTOLERANCE_PARAM: Record<string, string> = {
  "gluten-free": "gluten",
  "dairy-free": "dairy",
};
// Reverse of the above, used when caching a fetched recipe back into our
// own DietTag vocabulary from Spoonacular's `diets` response array.
const REVERSE_DIET: Record<string, string> = {
  vegetarian: "vegetarian",
  vegan: "vegan",
  ketogenic: "keto",
  pescetarian: "pescatarian",
  "gluten free": "gluten-free",
  "dairy free": "dairy-free",
};

export type SpoonacularSearchHit = {
  externalId: string;
  title: string;
  imageUrl: string | null;
};

export async function searchSpoonacularRecipes(
  filters: RecipeFilters,
  limit = 10
): Promise<SpoonacularSearchHit[]> {
  if (!isSpoonacularConfigured()) return [];

  const params = new URLSearchParams({
    apiKey: process.env.SPOONACULAR_API_KEY!,
    number: String(limit),
  });
  if (filters.cuisine) params.set("cuisine", filters.cuisine);

  const dietValues = filters.dietTags.map((t) => DIET_PARAM[t]).filter(Boolean);
  if (dietValues.length > 0) params.set("diet", dietValues.join(","));

  const intoleranceValues = filters.dietTags.map((t) => INTOLERANCE_PARAM[t]).filter(Boolean);
  if (intoleranceValues.length > 0) params.set("intolerances", intoleranceValues.join(","));

  if (filters.minCalories != null) params.set("minCalories", String(filters.minCalories));
  if (filters.maxCalories != null) params.set("maxCalories", String(filters.maxCalories));
  if (filters.minProtein != null) params.set("minProtein", String(filters.minProtein));

  try {
    const res = await fetch(`${BASE_URL}/recipes/complexSearch?${params}`);
    if (!res.ok) {
      console.error(`Spoonacular complexSearch failed: ${res.status} ${await res.text()}`);
      return [];
    }
    const data = await res.json();
    const results: unknown[] = data.results ?? [];
    return results.map((r) => {
      const hit = r as { id: number; title: string; image?: string };
      return { externalId: String(hit.id), title: hit.title, imageUrl: hit.image ?? null };
    });
  } catch (err) {
    console.error("Spoonacular complexSearch request failed", err);
    return [];
  }
}

export type SpoonacularRecipeDetail = {
  externalId: string;
  title: string;
  servings: number;
  cuisine: string | null;
  instructions: string[];
  caloriesPerServing: number | null;
  proteinPerServing: number | null;
  carbsPerServing: number | null;
  fatPerServing: number | null;
  dietTagNames: string[]; // already mapped to our DietTag vocabulary
  ingredients: { name: string; amount: number | null; unit: string | null }[];
};

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

function findNutrient(nutrients: { name: string; amount: number }[], name: string): number | null {
  return nutrients.find((n) => n.name === name)?.amount ?? null;
}

export async function getSpoonacularRecipeDetail(
  externalId: string
): Promise<SpoonacularRecipeDetail | null> {
  if (!isSpoonacularConfigured()) return null;

  const params = new URLSearchParams({
    apiKey: process.env.SPOONACULAR_API_KEY!,
    includeNutrition: "true",
  });

  try {
    const res = await fetch(`${BASE_URL}/recipes/${externalId}/information?${params}`);
    if (!res.ok) {
      console.error(`Spoonacular recipe information failed: ${res.status} ${await res.text()}`);
      return null;
    }
    const data = await res.json();

    const steps: string[] =
      data.analyzedInstructions?.[0]?.steps?.map((s: { step: string }) => s.step) ??
      (typeof data.instructions === "string" && data.instructions
        ? [stripHtml(data.instructions)]
        : []);

    const nutrients: { name: string; amount: number }[] = data.nutrition?.nutrients ?? [];

    const dietTagNames = ((data.diets ?? []) as string[])
      .map((d) => REVERSE_DIET[d.toLowerCase()])
      .filter((d): d is string => Boolean(d));

    const ingredients = ((data.extendedIngredients ?? []) as Array<{
      nameClean?: string;
      name?: string;
      amount?: number;
      unit?: string;
    }>).map((ing) => ({
      name: (ing.nameClean || ing.name || "unknown ingredient").toLowerCase().trim(),
      amount: ing.amount ?? null,
      unit: ing.unit || null,
    }));

    return {
      externalId: String(data.id),
      title: data.title,
      servings: data.servings ?? 1,
      cuisine: data.cuisines?.[0] ?? null,
      instructions: steps,
      caloriesPerServing: findNutrient(nutrients, "Calories"),
      proteinPerServing: findNutrient(nutrients, "Protein"),
      carbsPerServing: findNutrient(nutrients, "Carbohydrates"),
      fatPerServing: findNutrient(nutrients, "Fat"),
      dietTagNames,
      ingredients,
    };
  } catch (err) {
    console.error("Spoonacular recipe information request failed", err);
    return null;
  }
}

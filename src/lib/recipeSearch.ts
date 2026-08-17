import type { Prisma } from "@/generated/prisma/client";

// Parses the home page's ?diet=&cuisine=&minCalories=&maxCalories=&minProtein=
// query string (native GET <form>, no client JS) into typed filter values.
export type RecipeFilters = {
  dietTags: string[];
  cuisine?: string;
  minCalories?: number;
  maxCalories?: number;
  minProtein?: number;
};

export type RecipeSearchParams = {
  diet?: string | string[];
  cuisine?: string;
  minCalories?: string;
  maxCalories?: string;
  minProtein?: string;
};

function parseNumber(value: string | undefined): number | undefined {
  if (!value || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function parseRecipeFilters(searchParams: RecipeSearchParams): RecipeFilters {
  const dietTags = Array.isArray(searchParams.diet)
    ? searchParams.diet
    : searchParams.diet
      ? [searchParams.diet]
      : [];

  return {
    dietTags,
    cuisine: searchParams.cuisine?.trim() || undefined,
    minCalories: parseNumber(searchParams.minCalories),
    maxCalories: parseNumber(searchParams.maxCalories),
    minProtein: parseNumber(searchParams.minProtein),
  };
}

export function hasActiveFilters(filters: RecipeFilters): boolean {
  return (
    filters.dietTags.length > 0 ||
    filters.cuisine != null ||
    filters.minCalories != null ||
    filters.maxCalories != null ||
    filters.minProtein != null
  );
}

// Multiple diet tags are AND'd (a recipe must match every selected tag —
// "vegetarian" + "gluten-free" means both, not either), since that's how
// dietary restrictions actually combine for the person searching.
export function buildRecipeWhere(filters: RecipeFilters): Prisma.RecipeWhereInput {
  const and: Prisma.RecipeWhereInput[] = [];

  for (const tag of filters.dietTags) {
    and.push({ dietTags: { some: { dietTag: { name: tag } } } });
  }
  if (filters.cuisine) and.push({ cuisine: filters.cuisine });
  if (filters.minCalories != null) {
    and.push({ caloriesPerServing: { gte: filters.minCalories } });
  }
  if (filters.maxCalories != null) {
    and.push({ caloriesPerServing: { lte: filters.maxCalories } });
  }
  if (filters.minProtein != null) {
    and.push({ proteinPerServing: { gte: filters.minProtein } });
  }

  return and.length > 0 ? { AND: and } : {};
}

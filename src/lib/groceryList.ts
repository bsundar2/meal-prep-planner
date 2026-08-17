// Consolidates a week's planned recipes into a shopping list.
// Pure function over plain data (no Prisma types, no DB access) so it's
// unit-testable in isolation — see CLAUDE.md's "Grocery list consolidation
// strategy" for the merge/convert/fallback rules this implements.

export type PlannedIngredient = {
  ingredientId: string;
  ingredientName: string;
  category: string | null;
  amount: number | null; // null = "to taste" style entries, not scalable/summable
  unit: string | null;
};

export type PlannedEntry = {
  people: number;
  recipeServings: number;
  ingredients: PlannedIngredient[];
};

export type GroceryListLine = {
  ingredientId: string;
  ingredientName: string;
  amount: number | null;
  unit: string | null;
};

export type GroceryListSection = {
  category: string;
  lines: GroceryListLine[];
};

const CATEGORY_ORDER = [
  "produce",
  "meat",
  "seafood",
  "dairy",
  "grains",
  "pantry",
  "spices",
  "other",
] as const;

const NO_AMOUNT_FAMILY = "amount:none";

// unit -> { family, toBase }: `toBase` is how many of the family's base unit
// one of this unit equals, so amounts can be summed and converted back.
const UNIT_CONVERSIONS: Record<string, { family: string; toBase: number }> = {
  tsp: { family: "volume", toBase: 1 },
  tbsp: { family: "volume", toBase: 3 },
  cup: { family: "volume", toBase: 48 },
  oz: { family: "weight", toBase: 1 },
  lb: { family: "weight", toBase: 16 },
};

function unitFamily(unit: string): string {
  return UNIT_CONVERSIONS[unit]?.family ?? `unit:${unit}`;
}

function toBaseAmount(unit: string, amount: number): number {
  return amount * (UNIT_CONVERSIONS[unit]?.toBase ?? 1);
}

// Picks a human-friendly display unit for a summed base amount.
function fromBaseAmount(family: string, baseAmount: number): { amount: number; unit: string } {
  if (family === "volume") {
    if (baseAmount >= 48) return { amount: round(baseAmount / 48), unit: "cup" };
    if (baseAmount >= 3) return { amount: round(baseAmount / 3), unit: "tbsp" };
    return { amount: round(baseAmount), unit: "tsp" };
  }
  if (family === "weight") {
    if (baseAmount >= 16) return { amount: round(baseAmount / 16), unit: "lb" };
    return { amount: round(baseAmount), unit: "oz" };
  }
  // Singleton families (clove, can, piece, ...) never got converted, so
  // baseAmount is already in that literal unit.
  return { amount: round(baseAmount), unit: family.replace(/^unit:/, "") };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

type Accumulator = {
  ingredientId: string;
  ingredientName: string;
  category: string | null;
  family: string;
  baseAmount: number;
};

export function buildGroceryList(entries: PlannedEntry[]): GroceryListSection[] {
  const groups = new Map<string, Accumulator>();

  for (const entry of entries) {
    const scale = entry.recipeServings > 0 ? entry.people / entry.recipeServings : 1;

    for (const ing of entry.ingredients) {
      const family =
        ing.amount == null || ing.unit == null ? NO_AMOUNT_FAMILY : unitFamily(ing.unit);
      const key = `${ing.ingredientId}::${family}`;

      const existing = groups.get(key);
      const addedBaseAmount =
        family === NO_AMOUNT_FAMILY ? 0 : toBaseAmount(ing.unit as string, (ing.amount as number) * scale);

      if (existing) {
        existing.baseAmount += addedBaseAmount;
      } else {
        groups.set(key, {
          ingredientId: ing.ingredientId,
          ingredientName: ing.ingredientName,
          category: ing.category,
          family,
          baseAmount: addedBaseAmount,
        });
      }
    }
  }

  const lines: (GroceryListLine & { category: string | null })[] = Array.from(
    groups.values()
  ).map((group) => {
    if (group.family === NO_AMOUNT_FAMILY) {
      return {
        ingredientId: group.ingredientId,
        ingredientName: group.ingredientName,
        category: group.category,
        amount: null,
        unit: null,
      };
    }
    const { amount, unit } = fromBaseAmount(group.family, group.baseAmount);
    return {
      ingredientId: group.ingredientId,
      ingredientName: group.ingredientName,
      category: group.category,
      amount,
      unit,
    };
  });

  const byCategory = new Map<string, GroceryListLine[]>();
  for (const line of lines) {
    const category = line.category ?? "other";
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category)!.push({
      ingredientId: line.ingredientId,
      ingredientName: line.ingredientName,
      amount: line.amount,
      unit: line.unit,
    });
  }
  for (const groupLines of byCategory.values()) {
    groupLines.sort((a, b) => a.ingredientName.localeCompare(b.ingredientName));
  }

  const orderedCategories = [
    ...CATEGORY_ORDER.filter((c) => byCategory.has(c)),
    ...Array.from(byCategory.keys()).filter(
      (c) => !(CATEGORY_ORDER as readonly string[]).includes(c)
    ),
  ];

  return orderedCategories.map((category) => ({
    category,
    lines: byCategory.get(category)!,
  }));
}

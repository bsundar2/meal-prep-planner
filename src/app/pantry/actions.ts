"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export async function addPantryItem(formData: FormData) {
  const name = String(formData.get("ingredientName") ?? "").trim().toLowerCase();
  if (!name) return;

  const amountRaw = String(formData.get("amount") ?? "").trim();
  const unitRaw = String(formData.get("unit") ?? "").trim();
  const amount = amountRaw ? Number(amountRaw) : null;
  const unit = unitRaw || null;

  // Ingredients are shared with recipes (see CLAUDE.md), so an ingredient
  // typed here may already exist from a recipe, or may be brand new.
  const ingredient = await prisma.ingredient.upsert({
    where: { name },
    update: {},
    create: { name },
  });

  await prisma.pantryItem.upsert({
    where: { ingredientId: ingredient.id },
    update: { amount, unit },
    create: { ingredientId: ingredient.id, amount, unit },
  });

  revalidatePath("/pantry");
}

export async function removePantryItem(formData: FormData) {
  const id = String(formData.get("pantryItemId"));
  await prisma.pantryItem.delete({ where: { id } });
  revalidatePath("/pantry");
}

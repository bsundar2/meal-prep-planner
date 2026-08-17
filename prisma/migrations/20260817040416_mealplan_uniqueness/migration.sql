-- CreateIndex
CREATE UNIQUE INDEX "MealPlan_weekStart_key" ON "MealPlan"("weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "MealPlanEntry_mealPlanId_dayOfWeek_mealSlot_key" ON "MealPlanEntry"("mealPlanId", "dayOfWeek", "mealSlot");


-- AlterEnum
ALTER TYPE "RecipeSource" ADD VALUE 'SPOONACULAR';

-- AlterTable
ALTER TABLE "Recipe" ADD COLUMN     "externalId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_source_externalId_key" ON "Recipe"("source", "externalId");


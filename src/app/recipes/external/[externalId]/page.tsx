import Link from "next/link";
import { redirect } from "next/navigation";
import { cacheSpoonacularRecipe } from "@/lib/cacheExternalRecipe";

// Resolves a Spoonacular id to a local recipe (caching it on first view,
// see cacheExternalRecipe.ts) and redirects to the normal detail page, so
// every recipe -- local or external -- ends up at the same /recipes/[id]
// URL shape once it's actually been looked at.
export default async function ExternalRecipeResolverPage({
  params,
}: {
  params: Promise<{ externalId: string }>;
}) {
  const { externalId } = await params;
  const localId = await cacheSpoonacularRecipe(externalId);

  if (!localId) {
    return (
      <div className="min-h-screen bg-zinc-50 px-6 py-16 font-sans dark:bg-black">
        <main className="mx-auto flex max-w-2xl flex-col gap-4">
          <Link href="/" className="text-sm text-zinc-500 hover:underline">
            ← Recipes
          </Link>
          <p className="text-zinc-600 dark:text-zinc-400">
            Couldn&apos;t load this recipe from Spoonacular right now — try again in a moment.
          </p>
        </main>
      </div>
    );
  }

  redirect(`/recipes/${localId}`);
}

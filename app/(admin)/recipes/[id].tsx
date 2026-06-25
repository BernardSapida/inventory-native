import { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";

export default function AdminRecipeDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  useEffect(() => {
    // Recipe detail is now handled via bottom-sheet in the recipes index.
    // Navigate back to the list and let the user tap the recipe there.
    router.replace("/recipes" as never);
  }, [id]);
  return null;
}

import {
  collection,
  query,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  Timestamp,
  orderBy,
} from 'firebase/firestore';
import { db } from './config';
import { audit } from './audit';
import { RecipeModel } from '@/lib/types/recipe';
import { logger } from '@/lib/logger';
import { newOperationId, errorMeta } from './errors';

function toRecipe(data: Record<string, unknown>, id: string): RecipeModel {
  return {
    id,
    name: (data.name as string) ?? '',
    category: (data.category as string) ?? 'Main Course',
    servingSize: Number(data.servingSize ?? 1),
    instructions: (data.instructions as string) ?? '',
    ingredients: ((data.ingredients as unknown[]) ?? []).map((i) => {
      const ing = i as Record<string, unknown>;
      return {
        name: (ing.name as string) ?? (ing.itemName as string) ?? '',
        quantityPerServing: Number(ing.quantityPerServing ?? ing.quantity ?? 0),
        unit: (ing.unit as string) ?? 'pcs',
      };
    }),
    createdAt: data.createdAt ? (data.createdAt as Timestamp).toDate() : undefined,
    createdBy: (data.createdBy as string) ?? '',
    updatedAt: data.updatedAt ? (data.updatedAt as Timestamp).toDate() : undefined,
  };
}

export function watchRecipes(cb: (recipes: RecipeModel[]) => void): () => void {
  const operationId = newOperationId();
  const q = query(collection(db, 'recipes'), orderBy('name'));
  return onSnapshot(
    q,
    (snap) => {
      cb(snap.docs.map((d) => toRecipe(d.data() as Record<string, unknown>, d.id)));
    },
    (err) => {
      logger.error({ message: 'watchRecipes snapshot error', operationId, operation: 'recipes.watchRecipes', ...errorMeta(err) });
    }
  );
}

export async function addRecipe(
  recipe: Omit<RecipeModel, 'id' | 'createdAt'>,
  createdBy: string
): Promise<void> {
  const operationId = newOperationId();
  try {
    await addDoc(collection(db, 'recipes'), {
      ...recipe,
      createdBy,
      createdAt: serverTimestamp(),
    });
    audit('CREATE', 'Recipes', `Created recipe "${recipe.name}"`);
    logger.info({ message: 'Recipe added', operationId, userId: createdBy, operation: 'recipes.addRecipe', recipeName: recipe.name });
  } catch (err: unknown) {
    logger.error({ message: 'Add recipe failed', operationId, userId: createdBy, operation: 'recipes.addRecipe', recipeName: recipe.name, ...errorMeta(err) });
    throw err;
  }
}

export async function updateRecipe(
  id: string,
  updates: Partial<Omit<RecipeModel, 'id' | 'createdAt' | 'createdBy'>>
): Promise<void> {
  const operationId = newOperationId();
  try {
    await updateDoc(doc(db, 'recipes', id), updates);
    audit('UPDATE', 'Recipes', `Updated recipe "${updates.name ?? id}"`);
    logger.info({ message: 'Recipe updated', operationId, operation: 'recipes.updateRecipe', recipeId: id });
  } catch (err: unknown) {
    logger.error({ message: 'Update recipe failed', operationId, operation: 'recipes.updateRecipe', recipeId: id, ...errorMeta(err) });
    throw err;
  }
}

export async function deleteRecipe(id: string): Promise<void> {
  const operationId = newOperationId();
  try {
    // Read the name before deleting - afterwards there is nothing left to read.
    let name = id;
    try {
      name = ((await getDoc(doc(db, 'recipes', id))).data()?.name as string) || id;
    } catch {
      // Fall back to the id rather than lose the audit entry.
    }
    await deleteDoc(doc(db, 'recipes', id));
    audit('DELETE', 'Recipes', `Deleted recipe "${name}"`);
    logger.info({ message: 'Recipe deleted', operationId, operation: 'recipes.deleteRecipe', recipeId: id });
  } catch (err: unknown) {
    logger.error({ message: 'Delete recipe failed', operationId, operation: 'recipes.deleteRecipe', recipeId: id, ...errorMeta(err) });
    throw err;
  }
}


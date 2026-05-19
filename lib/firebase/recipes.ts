import {
  collection,
  query,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  Timestamp,
  runTransaction,
  getDocs,
  orderBy,
} from 'firebase/firestore';
import { db } from './config';
import { RecipeModel } from '@/lib/types/recipe';
import { computeStatus } from '@/lib/types/inventory';
import { createNotification } from './notifications';
import { logger } from '@/lib/logger';
import { newOperationId, errorMeta } from './errors';

function toRecipe(data: Record<string, unknown>, id: string): RecipeModel {
  return {
    id,
    name: (data.name as string) ?? '',
    category: (data.category as string) ?? 'General',
    servingSize: Number(data.servingSize ?? 1),
    instructions: (data.instructions as string) ?? '',
    ingredients: ((data.ingredients as unknown[]) ?? []).map((i) => {
      const ing = i as Record<string, unknown>;
      return {
        itemId: (ing.itemId as string) ?? '',
        itemName: (ing.itemName as string) ?? '',
        quantity: Number(ing.quantity ?? 0),
        unit: (ing.unit as string) ?? 'pcs',
      };
    }),
    createdAt: data.createdAt ? (data.createdAt as Timestamp).toDate() : undefined,
    createdBy: (data.createdBy as string) ?? '',
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
    logger.info({ message: 'Recipe updated', operationId, operation: 'recipes.updateRecipe', recipeId: id });
  } catch (err: unknown) {
    logger.error({ message: 'Update recipe failed', operationId, operation: 'recipes.updateRecipe', recipeId: id, ...errorMeta(err) });
    throw err;
  }
}

export async function deleteRecipe(id: string): Promise<void> {
  const operationId = newOperationId();
  try {
    await deleteDoc(doc(db, 'recipes', id));
    logger.info({ message: 'Recipe deleted', operationId, operation: 'recipes.deleteRecipe', recipeId: id });
  } catch (err: unknown) {
    logger.error({ message: 'Delete recipe failed', operationId, operation: 'recipes.deleteRecipe', recipeId: id, ...errorMeta(err) });
    throw err;
  }
}

export async function checkAvailability(
  recipe: RecipeModel,
  times: number
): Promise<{ available: boolean; missing: string[] }> {
  const operationId = newOperationId();
  try {
    const missing: string[] = [];
    const invSnap = await getDocs(collection(db, 'inventory'));
    const inv = new Map<string, number>();
    invSnap.forEach((d) => inv.set(d.id, Number(d.data().quantity ?? 0)));

    for (const ing of recipe.ingredients) {
      const current = inv.get(ing.itemId) ?? 0;
      if (current < ing.quantity * times) {
        missing.push(ing.itemName);
      }
    }
    return { available: missing.length === 0, missing };
  } catch (err: unknown) {
    logger.error({ message: 'Check availability failed', operationId, operation: 'recipes.checkAvailability', recipeId: recipe.id, ...errorMeta(err) });
    throw err;
  }
}

export async function prepareRecipe(
  recipe: RecipeModel,
  times: number,
  performedBy: string
): Promise<void> {
  const operationId = newOperationId();
  try {
    await runTransaction(db, async (tx) => {
      const invSnap = await getDocs(collection(db, 'inventory'));
      const invMap = new Map<string, { qty: number; threshold: number }>();
      invSnap.forEach((d) =>
        invMap.set(d.id, {
          qty: Number(d.data().quantity ?? 0),
          threshold: Number(d.data().minimumThreshold ?? 0),
        })
      );

      for (const ing of recipe.ingredients) {
        const item = invMap.get(ing.itemId);
        if (!item) throw new Error(`Item ${ing.itemName} not found.`);
        const needed = ing.quantity * times;
        if (item.qty < needed) throw new Error(`Insufficient stock for ${ing.itemName}.`);

        const newQty = item.qty - needed;
        const status = computeStatus(newQty, item.threshold);
        tx.update(doc(db, 'inventory', ing.itemId), {
          quantity: newQty,
          status,
          updatedBy: performedBy,
          updatedAt: serverTimestamp(),
        });

        const logRef = doc(collection(db, 'inventory_logs'));
        tx.set(logRef, {
          itemId: ing.itemId,
          itemName: ing.itemName,
          action: 'recipe_used',
          previousQuantity: item.qty,
          quantityChanged: -needed,
          newQuantity: newQty,
          performedBy,
          recipeName: recipe.name,
          createdAt: serverTimestamp(),
        });
      }
    });

    await createNotification(
      `Recipe prepared: ${recipe.name}`,
      `${recipe.name} was prepared ×${times} by ${performedBy}.`,
      'admin',
      'recipe_prepared'
    );

    logger.info({ message: 'Recipe prepared', operationId, userId: performedBy, operation: 'recipes.prepareRecipe', recipeId: recipe.id, recipeName: recipe.name, times });
  } catch (err: unknown) {
    logger.error({ message: 'Prepare recipe failed', operationId, userId: performedBy, operation: 'recipes.prepareRecipe', recipeId: recipe.id, recipeName: recipe.name, ...errorMeta(err) });
    throw err;
  }
}

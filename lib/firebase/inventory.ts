import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  Timestamp,
  runTransaction,
  where,
  getDocs,
  limit,
} from 'firebase/firestore';
import { db } from './config';
import {
  FirestoreInventoryItem,
  ItemStatus,
  computeStatus,
} from '@/lib/types/inventory';
import { createNotification } from './notifications';
import { logger } from '@/lib/logger';
import { newOperationId, errorMeta } from './errors';

function toDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') return new Date(value);
  return undefined;
}

function toItem(data: Record<string, unknown>, id: string): FirestoreInventoryItem {
  return {
    id,
    name: (data.name as string) ?? '',
    category: (data.category as FirestoreInventoryItem['category']) ?? 'General',
    unit: (data.unit as string) ?? 'pcs',
    quantity: Number(data.quantity ?? 0),
    minimumThreshold: Number(data.minimumThreshold ?? 0),
    expirationDate: toDate(data.expirationDate),
    barcode: (data.barcode as string) ?? '',
    countable: (data.countable as boolean) ?? false,
    status: (data.status as ItemStatus) ?? 'ok',
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    updatedBy: (data.updatedBy as string) ?? '',
  };
}

export function watchInventoryItems(
  cb: (items: FirestoreInventoryItem[]) => void
): () => void {
  const operationId = newOperationId();
  const q = query(collection(db, 'inventory'), orderBy('name'));
  return onSnapshot(
    q,
    (snap) => {
      cb(snap.docs.map((d) => toItem(d.data() as Record<string, unknown>, d.id)));
    },
    (err) => {
      logger.error({ message: 'watchInventoryItems snapshot error', operationId, operation: 'inventory.watchInventoryItems', ...errorMeta(err) });
    }
  );
}

export function watchExpiringSoon(
  days: number,
  cb: (items: FirestoreInventoryItem[]) => void
): () => void {
  const operationId = newOperationId();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + days);
  const q = query(
    collection(db, 'inventory'),
    where('expirationDate', '<=', Timestamp.fromDate(cutoff)),
    where('expirationDate', '>=', Timestamp.fromDate(new Date()))
  );
  return onSnapshot(
    q,
    (snap) => {
      cb(snap.docs.map((d) => toItem(d.data() as Record<string, unknown>, d.id)));
    },
    (err) => {
      logger.error({ message: 'watchExpiringSoon snapshot error', operationId, operation: 'inventory.watchExpiringSoon', ...errorMeta(err) });
    }
  );
}

export async function addItem(
  item: Omit<FirestoreInventoryItem, 'id' | 'status' | 'createdAt' | 'updatedAt'>,
  performedBy: string
): Promise<string> {
  const operationId = newOperationId();
  try {
    const status = computeStatus(item.quantity, item.minimumThreshold);
    const ref = await addDoc(collection(db, 'inventory'), {
      ...item,
      expirationDate: item.expirationDate ? Timestamp.fromDate(item.expirationDate) : null,
      status,
      updatedBy: performedBy,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await addDoc(collection(db, 'inventory_logs'), {
      itemId: ref.id,
      itemName: item.name,
      action: 'added',
      previousQuantity: 0,
      quantityChanged: item.quantity,
      newQuantity: item.quantity,
      performedBy,
      createdAt: serverTimestamp(),
    });

    await syncAlerts(ref.id, item.name, item.quantity, item.minimumThreshold, item.expirationDate);
    logger.info({ message: 'Inventory item added', operationId, userId: performedBy, operation: 'inventory.addItem', itemId: ref.id, itemName: item.name });
    return ref.id;
  } catch (err: unknown) {
    logger.error({ message: 'Add inventory item failed', operationId, userId: performedBy, operation: 'inventory.addItem', itemName: item.name, ...errorMeta(err) });
    throw err;
  }
}

export async function updateItem(
  id: string,
  updates: Partial<Omit<FirestoreInventoryItem, 'id'>>,
  performedBy: string
): Promise<void> {
  const operationId = newOperationId();
  try {
    const { expirationDate, ...rest } = updates;
    const payload: Record<string, unknown> = {
      ...rest,
      updatedBy: performedBy,
      updatedAt: serverTimestamp(),
    };
    if ('expirationDate' in updates) {
      payload.expirationDate = expirationDate ? Timestamp.fromDate(expirationDate) : null;
    }
    if (updates.quantity !== undefined && updates.minimumThreshold !== undefined) {
      payload.status = computeStatus(updates.quantity, updates.minimumThreshold);
    }
    await updateDoc(doc(db, 'inventory', id), payload);
    logger.info({ message: 'Inventory item updated', operationId, userId: performedBy, operation: 'inventory.updateItem', itemId: id });
  } catch (err: unknown) {
    logger.error({ message: 'Update inventory item failed', operationId, userId: performedBy, operation: 'inventory.updateItem', itemId: id, ...errorMeta(err) });
    throw err;
  }
}

export async function deleteItem(id: string): Promise<void> {
  const operationId = newOperationId();
  try {
    await deleteDoc(doc(db, 'inventory', id));
    logger.info({ message: 'Inventory item deleted', operationId, operation: 'inventory.deleteItem', itemId: id });
  } catch (err: unknown) {
    logger.error({ message: 'Delete inventory item failed', operationId, operation: 'inventory.deleteItem', itemId: id, ...errorMeta(err) });
    throw err;
  }
}

export async function adjustQuantity(
  itemId: string,
  itemName: string,
  newQuantity: number,
  action: string,
  performedBy: string,
  minimumThreshold: number
): Promise<void> {
  const operationId = newOperationId();
  const itemRef = doc(db, 'inventory', itemId);

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(itemRef);
      if (!snap.exists()) throw new Error('Item not found');
      const prev = Number(snap.data().quantity ?? 0);
      const status = computeStatus(newQuantity, minimumThreshold);
      tx.update(itemRef, {
        quantity: newQuantity,
        status,
        updatedBy: performedBy,
        updatedAt: serverTimestamp(),
      });
      const logRef = doc(collection(db, 'inventory_logs'));
      tx.set(logRef, {
        itemId,
        itemName,
        action,
        previousQuantity: prev,
        quantityChanged: newQuantity - prev,
        newQuantity,
        performedBy,
        createdAt: serverTimestamp(),
      });
    });

    await syncAlerts(itemId, itemName, newQuantity, minimumThreshold);
    logger.info({ message: 'Quantity adjusted', operationId, userId: performedBy, operation: 'inventory.adjustQuantity', itemId, itemName, action, newQuantity });
  } catch (err: unknown) {
    logger.error({ message: 'Adjust quantity failed', operationId, userId: performedBy, operation: 'inventory.adjustQuantity', itemId, itemName, ...errorMeta(err) });
    throw err;
  }
}

async function syncAlerts(
  itemId: string,
  itemName: string,
  quantity: number,
  threshold: number,
  expirationDate?: Date
): Promise<void> {
  const operationId = newOperationId();
  try {
    if (quantity <= 0) {
      await createNotification(
        `${itemName} is out of stock`,
        `${itemName} has run out. Restock immediately.`,
        'all',
        'out_of_stock',
        itemId
      );
    } else if (quantity <= threshold) {
      await createNotification(
        `Low stock: ${itemName}`,
        `${itemName} is running low (${quantity} remaining).`,
        'all',
        'low_stock',
        itemId
      );
    }

    if (expirationDate) {
      const days = Math.ceil(
        (expirationDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      if (days <= 7 && days > 0) {
        await createNotification(
          `Expiring soon: ${itemName}`,
          `${itemName} expires in ${days} day(s).`,
          'all',
          'expiry',
          itemId
        );
      }
    }
  } catch (err: unknown) {
    logger.warn({ message: 'syncAlerts failed (non-critical)', operationId, operation: 'inventory.syncAlerts', itemId, itemName, ...errorMeta(err) });
  }
}

export async function getItemByBarcode(
  barcode: string
): Promise<FirestoreInventoryItem | null> {
  const operationId = newOperationId();
  try {
    const q = query(collection(db, 'inventory'), where('barcode', '==', barcode), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0];
    return toItem(d.data() as Record<string, unknown>, d.id);
  } catch (err: unknown) {
    logger.error({ message: 'Get item by barcode failed', operationId, operation: 'inventory.getItemByBarcode', barcode, ...errorMeta(err) });
    throw err;
  }
}

import {
  collection,
  query,
  onSnapshot,
  addDoc,
  serverTimestamp,
  Timestamp,
  orderBy,
} from 'firebase/firestore';
import { db } from './config';
import { InspectionModel, InspectionCondition } from '@/lib/types/inspection';
import { createNotification } from './notifications';
import { logger } from '@/lib/logger';
import { newOperationId, errorMeta } from './errors';

function toInspection(data: Record<string, unknown>, id: string): InspectionModel {
  return {
    id,
    itemName: (data.itemName as string) ?? '',
    condition: (data.condition as InspectionCondition) ?? 'good',
    notes: (data.notes as string) ?? '',
    staffId: (data.staffId as string) ?? '',
    staffName: (data.staffName as string) ?? undefined,
    checkedAt: data.checkedAt ? (data.checkedAt as Timestamp).toDate() : undefined,
  };
}

export function watchInspections(cb: (items: InspectionModel[]) => void): () => void {
  const operationId = newOperationId();
  const q = query(collection(db, 'inspections'), orderBy('checkedAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      cb(snap.docs.map((d) => toInspection(d.data() as Record<string, unknown>, d.id)));
    },
    (err) => {
      logger.error({ message: 'watchInspections snapshot error', operationId, operation: 'inspections.watchInspections', ...errorMeta(err) });
    }
  );
}

export async function addInspection(
  itemName: string,
  condition: InspectionCondition,
  notes: string,
  staffId: string,
  staffName: string
): Promise<void> {
  const operationId = newOperationId();
  try {
    await addDoc(collection(db, 'inspections'), {
      itemName,
      condition,
      notes,
      staffId,
      staffName,
      checkedAt: serverTimestamp(),
    });

    if (condition === 'damaged' || condition === 'warning') {
      await createNotification(
        `Inspection alert: ${itemName}`,
        `${staffName} reported ${itemName} as ${condition}. Notes: ${notes || 'None'}`,
        'admin',
        'inspection_alert'
      );
    }

    logger.info({ message: 'Inspection added', operationId, userId: staffId, operation: 'inspections.addInspection', itemName, condition });
  } catch (err: unknown) {
    logger.error({ message: 'Add inspection failed', operationId, userId: staffId, operation: 'inspections.addInspection', itemName, condition, ...errorMeta(err) });
    throw err;
  }
}

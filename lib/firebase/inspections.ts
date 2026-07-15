import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from './config';
import {
  InspectionModel,
  InspectionCondition,
  InspectionStatus,
  isDisposable,
} from '@/lib/types/inspection';
import { formatQuantity } from '@/lib/types/product';
import { createNotification } from './notifications';
import { audit } from './audit';
import { logger } from '@/lib/logger';
import { newOperationId, errorMeta } from './errors';

function toInspection(data: Record<string, unknown>, id: string): InspectionModel {
  return {
    id,
    productId: (data.productId as string) ?? null,
    batchId: (data.batchId as string) ?? null,
    itemName: (data.itemName as string) ?? '',
    // Legacy rows predate the assign/perform split: they were written already
    // done, so a row with a condition and no status is a completed inspection.
    status:
      (data.status as InspectionStatus) ?? (data.condition ? 'completed' : 'pending'),
    condition: (data.condition as InspectionCondition) ?? null,
    notes: (data.notes as string) ?? '',
    assignedTo: (data.assignedTo as string) ?? null,
    assignedToName: (data.assignedToName as string) ?? null,
    assignedBy: (data.assignedBy as string) ?? null,
    dueDate: (data.dueDate as Timestamp) ?? null,
    staffId: (data.staffId as string) ?? '',
    staffName: (data.staffName as string) ?? undefined,
    checkedAt: data.checkedAt ? (data.checkedAt as Timestamp).toDate() : undefined,
    disposed: (data.disposed as boolean) ?? false,
    disposedAt: (data.disposedAt as Timestamp) ?? null,
    disposedQuantity: (data.disposedQuantity as number) ?? null,
  };
}

export function watchInspections(cb: (items: InspectionModel[]) => void): () => void {
  const operationId = newOperationId();
  // No orderBy: pending assignments have no checkedAt yet, and orderBy would
  // drop them entirely. Sort client-side instead.
  return onSnapshot(
    query(collection(db, 'inspections')),
    (snap) => {
      const items = snap.docs
        .map((d) => toInspection(d.data() as Record<string, unknown>, d.id))
        .sort((a, b) => {
          // Pending first (they're the to-do list), then newest completed.
          if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
          return (b.checkedAt?.getTime() ?? 0) - (a.checkedAt?.getTime() ?? 0);
        });
      cb(items);
    },
    (err) => {
      logger.error({ message: 'watchInspections snapshot error', operationId, operation: 'inspections.watchInspections', ...errorMeta(err) });
    }
  );
}

/** Inspections assigned to a specific staff member and not yet performed. */
export function watchAssignedInspections(
  staffId: string,
  cb: (items: InspectionModel[]) => void
): () => void {
  const operationId = newOperationId();
  return onSnapshot(
    query(
      collection(db, 'inspections'),
      where('assignedTo', '==', staffId),
      where('status', '==', 'pending')
    ),
    (snap) => {
      cb(snap.docs.map((d) => toInspection(d.data() as Record<string, unknown>, d.id)));
    },
    (err) => {
      logger.error({ message: 'watchAssignedInspections snapshot error', operationId, operation: 'inspections.watchAssigned', ...errorMeta(err) });
    }
  );
}

/** Admin action: assign an inspection to a staff member. */
export async function assignInspection(args: {
  productId: string;
  batchId: string | null;
  itemName: string;
  assignedTo: string;
  assignedToName: string;
  assignedBy: string;
  dueDate: Date | null;
}): Promise<string> {
  const operationId = newOperationId();
  try {
    const ref = await addDoc(collection(db, 'inspections'), {
      productId: args.productId,
      batchId: args.batchId,
      itemName: args.itemName,
      status: 'pending' as InspectionStatus,
      condition: null,
      notes: '',
      assignedTo: args.assignedTo,
      assignedToName: args.assignedToName,
      assignedBy: args.assignedBy,
      dueDate: args.dueDate ? Timestamp.fromDate(args.dueDate) : null,
      staffId: '',
      disposed: false,
      disposedAt: null,
      createdAt: serverTimestamp(),
    });

    await createNotification(
      'New inspection assigned',
      `You have been asked to inspect "${args.itemName}".`,
      'staff',
      'inspection_alert'
    );

    audit('CREATE', 'Inspections', `Assigned inspection of "${args.itemName}" to ${args.assignedToName}`);
    logger.info({ message: 'Inspection assigned', operationId, operation: 'inspections.assignInspection', itemName: args.itemName });
    return ref.id;
  } catch (err: unknown) {
    logger.error({ message: 'Assign inspection failed', operationId, operation: 'inspections.assignInspection', ...errorMeta(err), itemName: args.itemName });
    throw err;
  }
}

/**
 * Record the result of an inspection.
 *
 * `inspectionId` is set when completing a previously assigned inspection, and
 * omitted for an ad-hoc one (staff can still inspect something nobody assigned).
 */
export async function submitInspection(args: {
  inspectionId?: string;
  productId: string | null;
  batchId: string | null;
  itemName: string;
  condition: InspectionCondition;
  notes: string;
  staffId: string;
  staffName: string;
}): Promise<string> {
  const operationId = newOperationId();
  const { inspectionId, itemName, condition, notes, staffId, staffName } = args;

  try {
    const result = {
      productId: args.productId,
      batchId: args.batchId,
      itemName,
      status: 'completed' as InspectionStatus,
      condition,
      notes,
      staffId,
      staffName,
      checkedAt: serverTimestamp(),
    };

    let id: string;
    if (inspectionId) {
      await updateDoc(doc(db, 'inspections', inspectionId), result);
      id = inspectionId;
    } else {
      const ref = await addDoc(collection(db, 'inspections'), {
        ...result,
        assignedTo: null,
        assignedToName: null,
        assignedBy: null,
        dueDate: null,
        disposed: false,
        disposedAt: null,
      });
      id = ref.id;
    }

    if (condition === 'damaged' || condition === 'warning' || condition === 'expired') {
      await createNotification(
        `Inspection alert: ${itemName}`,
        `${staffName} reported ${itemName} as ${condition}. Notes: ${notes || 'None'}`,
        'admin',
        'inspection_alert'
      );
    }

    audit(
      'CREATE',
      'Inspections',
      `Inspected "${itemName}" - condition: ${condition}`,
      condition === 'good' ? 'success' : 'warning'
    );

    logger.info({ message: 'Inspection submitted', operationId, userId: staffId, operation: 'inspections.submitInspection', itemName, condition });
    return id;
  } catch (err: unknown) {
    logger.error({ message: 'Submit inspection failed', operationId, userId: staffId, operation: 'inspections.submitInspection', itemName, condition, ...errorMeta(err) });
    throw err;
  }
}

/**
 * Dispose of an inspected item and record it in inventory history.
 *
 * PARTIAL DISPOSAL: `quantityBase` is how much (in the product's base unit) is
 * actually being written off. If it's less than the batch holds, the batch is
 * reduced rather than deleted -- 2 kg of a 5 kg batch spoiled leaves 3 kg on hand.
 * Only a full write-off deletes the batch.
 *
 * Nothing can verify the amount: the system has no way to know how much of a batch
 * went bad, so this number is the inspector's claim. That is exactly why it lands
 * in `inventory_events` and the audit log with a name attached.
 *
 * Writes an `inventory_events` doc with `type: "disposal"` -- the SAME schema the
 * admin web writes (see smartstock-admin src/features/expiry/firebase.ts and
 * src/features/inspections/inspections.ts), so a disposal made on the phone and one
 * made on the web land in one inventory history rather than two disconnected logs.
 *
 * Only allowed for an inspection that (a) is completed, (b) found the item damaged
 * or expired, and (c) is tied to a real batch -- we are removing stock, so we have
 * to know exactly which stock.
 */
export async function disposeInspectedItem(args: {
  inspection: InspectionModel;
  /** Amount to dispose, in the product's base unit. Omit to dispose the whole batch. */
  quantityBase?: number;
  /** Product's display unit (e.g. "kg"), so notifications read "0.6 kg" not "600". */
  displayUnit?: string;
  reason?: string;
  disposedBy: string;
  disposedByName: string;
}): Promise<void> {
  const operationId = newOperationId();
  const { inspection, disposedBy, disposedByName } = args;

  if (inspection.status !== 'completed' || !isDisposable(inspection.condition)) {
    throw new Error('Only a completed inspection marked damaged or expired can be disposed.');
  }
  if (!inspection.batchId || !inspection.productId) {
    throw new Error('This inspection is not linked to a specific batch, so it cannot be disposed.');
  }
  if (inspection.disposed) {
    throw new Error('This item has already been disposed.');
  }

  try {
    // Read the batch BEFORE writing: we need to know how much it holds, both to
    // validate the requested amount and to decide reduce-vs-delete.
    const batchSnap = await getDoc(doc(db, 'inventory_batches', inspection.batchId));
    if (!batchSnap.exists()) {
      throw new Error('That batch no longer exists - it may already have been used or removed.');
    }
    const onHand = (batchSnap.data()?.quantity as number) ?? 0;

    const quantity = args.quantityBase ?? onHand; // default: write off everything
    if (quantity <= 0) {
      throw new Error('Enter how much is being disposed.');
    }
    if (quantity > onHand) {
      throw new Error(`This batch only has ${onHand} left - you cannot dispose more than that.`);
    }

    const remaining = onHand - quantity;
    const isFull = remaining <= 0;

    const wb = writeBatch(db);

    // 1. Inventory history entry (matches the admin web's disposal schema).
    wb.set(doc(collection(db, 'inventory_events')), {
      productId: inspection.productId,
      batchId: inspection.batchId,
      type: 'disposal',
      reason: args.reason ?? inspection.condition, // "damaged" | "expired"
      note: inspection.notes ?? '',
      quantity, // how much was written off, NOT how much the batch held
      partial: !isFull,
      inspectionId: inspection.id,
      by: disposedBy,
      byName: disposedByName,
      at: serverTimestamp(),
    });

    // 2. Reduce the batch, or remove it entirely if nothing is left.
    if (isFull) {
      wb.delete(doc(db, 'inventory_batches', inspection.batchId));
    } else {
      wb.update(doc(db, 'inventory_batches', inspection.batchId), { quantity: remaining });
    }

    // 3. Mark the inspection so it can't be disposed twice.
    wb.update(doc(db, 'inspections', inspection.id), {
      disposed: true,
      disposedAt: serverTimestamp(),
      disposedQuantity: quantity,
    });

    await wb.commit();

    // Show the quantities with their unit ("0.6 kg of 1.6 kg"), not bare base-unit
    // numbers ("600 of 1600"), which are ambiguous to whoever reads the alert.
    const disposedText = args.displayUnit
      ? formatQuantity(quantity, args.displayUnit)
      : String(quantity);
    const onHandText = args.displayUnit
      ? formatQuantity(onHand, args.displayUnit)
      : String(onHand);
    await createNotification(
      `Item disposed: ${inspection.itemName}`,
      `${disposedByName} disposed of ${disposedText} ${isFull ? '(entire batch)' : `of ${onHandText}`} of ${inspection.itemName} (${inspection.condition}).`,
      'admin',
      'inspection_alert'
    );

    audit(
      'DELETE',
      'Inventory',
      `Disposed ${quantity} of "${inspection.itemName}" (${inspection.condition}) after inspection${isFull ? ' - whole batch removed' : ` - ${remaining} left on hand`}`,
      'warning'
    );

    logger.info({ message: 'Inspected item disposed', operationId, userId: disposedBy, operation: 'inspections.disposeInspectedItem', itemName: inspection.itemName, quantity, partial: !isFull });
  } catch (err: unknown) {
    logger.error({ message: 'Dispose inspected item failed', operationId, userId: disposedBy, operation: 'inspections.disposeInspectedItem', itemName: inspection.itemName, ...errorMeta(err) });
    throw err;
  }
}

/** Legacy signature kept so existing callers keep compiling. */
export async function addInspection(
  itemName: string,
  condition: InspectionCondition,
  notes: string,
  staffId: string,
  staffName: string
): Promise<void> {
  await submitInspection({
    productId: null,
    batchId: null,
    itemName,
    condition,
    notes,
    staffId,
    staffName,
  });
}

export async function deleteInspection(id: string): Promise<void> {
  await deleteDoc(doc(db, 'inspections', id));
  audit('DELETE', 'Inspections', `Deleted inspection ${id}`);
}

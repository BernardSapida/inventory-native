import type { Timestamp } from "firebase/firestore";

export type InspectionCondition = "good" | "warning" | "damaged" | "expired";

/** An inspection is assigned, then performed, then (optionally) acted on. */
export type InspectionStatus = "pending" | "completed";

/** Conditions that make an inspected item a candidate for disposal. */
export const DISPOSABLE_CONDITIONS: InspectionCondition[] = [
  "damaged",
  "expired",
];

export function isDisposable(c: InspectionCondition | null): boolean {
  return c != null && DISPOSABLE_CONDITIONS.includes(c);
}

export interface InspectionModel {
  id: string;

  /**
   * Product under inspection. Null on legacy rows, which recorded only a
   * free-text itemName -- those can be viewed but never disposed, because we
   * cannot tell which stock they refer to.
   */
  productId: string | null;
  /** The specific batch inspected. Required to dispose (that's what we delete). */
  batchId: string | null;
  itemName: string;

  status: InspectionStatus;
  /** Null while the inspection is still pending. */
  condition: InspectionCondition | null;
  notes: string;

  // Assignment: an admin assigns, a staff member performs.
  assignedTo: string | null;
  assignedToName: string | null;
  assignedBy: string | null;
  dueDate: Timestamp | null;

  // Who actually performed it.
  staffId: string;
  staffName?: string;
  checkedAt?: Date;

  /** Set once the item has been disposed of and pulled from stock. */
  disposed: boolean;
  disposedAt: Timestamp | null;
  /**
   * How much was written off, in the product's base unit. May be less than the
   * batch held - a partial disposal (2 kg of a 5 kg batch) leaves the rest on hand.
   */
  disposedQuantity: number | null;
}

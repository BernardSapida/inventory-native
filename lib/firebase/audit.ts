// Append-only audit trail, written to the shared `audit_logs` collection.
//
// SCHEMA MUST MATCH smartstock-admin/src/lib/audit.ts exactly -- the web Audit
// Logs page reads both apps' rows out of the same collection. Until now only the
// web app wrote here, so every inventory change, recipe edit and preparation done
// on a phone (which is where staff do all their work) was invisible to the log.
//
// Audit logging must never break a user flow: all failures are swallowed.

import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "./config";
import { logger } from "@/lib/logger";
import { useAuthStore } from "@/store/auth";

export type AuditAction =
  | "LOGIN"
  | "LOGOUT"
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "EXPORT"
  | "SETTING"
  | "ALERT";

export type AuditStatus = "success" | "warning" | "failed";

export interface AuditActor {
  uid: string;
  name: string; // display name or email
  role: string;
}

interface LogActionInput {
  uid: string;
  user: string;
  role: string;
  action: AuditAction;
  module: string; // Auth | Inventory | Recipes | Inspections | ...
  description: string;
  status?: AuditStatus;
}

export async function logAction(input: LogActionInput): Promise<void> {
  try {
    await addDoc(collection(db, "audit_logs"), {
      uid: input.uid,
      user: input.user,
      role: input.role,
      action: input.action,
      module: input.module,
      description: input.description,
      status: input.status ?? "success",
      timestamp: serverTimestamp(),
    });
  } catch {
    // Never surface: a failed audit write must not fail the user's action.
    logger.warn({
      message: "Audit log write failed",
      operation: "audit.logAction",
      auditAction: input.action,
      auditModule: input.module,
    });
  }
}

/**
 * Log an action by the currently signed-in user.
 *
 * The actor is pulled from the auth store rather than threaded through every
 * write signature -- these firebase helpers are called from a dozen screens and
 * none of them carried a user. Reading the store keeps the call sites to one
 * line, which is the difference between auditing every mutation and auditing
 * the handful someone remembered to pass a user to.
 *
 * Fire-and-forget by design: never awaited, never throws.
 */
export function audit(
  action: AuditAction,
  module: string,
  description: string,
  status: AuditStatus = "success",
): void {
  void logCurrentUserAction(action, module, description, status);
}

/**
 * Same as audit(), but awaitable. Use when the write must land before something
 * else happens -- notably LOGOUT, which has to be recorded while the user is
 * still authenticated or Firestore rules will reject it.
 */
export async function logCurrentUserAction(
  action: AuditAction,
  module: string,
  description: string,
  status: AuditStatus = "success",
): Promise<void> {
  const user = useAuthStore.getState().user;
  await logAction({
    uid: user?.uid ?? "",
    user: user?.fullName || user?.email || "unknown",
    role: user?.role ?? "staff",
    action,
    module,
    description,
    status,
  });
}

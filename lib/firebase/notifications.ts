import { logger } from "@/lib/logger";
import {
  AppNotification,
  NotificationTargetRole,
  NotificationType,
} from "@/lib/types/notification";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./config";
import { errorMeta, newOperationId } from "./errors";

function toNotification(
  data: Record<string, unknown>,
  id: string,
): AppNotification {
  return {
    id,
    title: (data.title as string) ?? "",
    message: (data.message as string) ?? "",
    targetRole: (data.targetRole as NotificationTargetRole) ?? "admin",
    type: (data.type as NotificationType) ?? "general",
    itemId: data.itemId as string | undefined,
    isRead: (data.isRead as boolean) ?? false,
    timestamp: data.timestamp
      ? (data.timestamp as Timestamp).toDate()
      : undefined,
    readAt: data.readAt ? (data.readAt as Timestamp).toDate() : undefined,
  };
}

/**
 * Live unread notifications for a role.
 *
 * Matches `targetRole === role` OR `targetRole === 'all'`. The old query was
 * `where('targetRole', '==', role)`, which silently excluded every "all" broadcast
 * - and since virtually every writer targeted "admin", a staff user was listening
 * to an inbox that could never contain anything. The screen looked static because
 * it was permanently empty, not because it wasn't live.
 *
 * targetRole is filtered client-side rather than with `where(... 'in' ...)`: an
 * `in` combined with the isRead equality would need a composite index, while
 * isRead alone rides Firestore's automatic single-field index.
 */
export function watchNotificationsForRole(
  role: NotificationTargetRole,
  cb: (notifications: AppNotification[]) => void,
): () => void {
  const operationId = newOperationId();
  const q = query(
    collection(db, "notifications"),
    where("isRead", "==", false),
  );
  return onSnapshot(
    q,
    (snap) => {
      const notifs = snap.docs
        .map((d) => toNotification(d.data() as Record<string, unknown>, d.id))
        .filter((n) => n.targetRole === role || n.targetRole === "all")
        .sort(
          (a, b) =>
            (b.timestamp?.getTime() ?? 0) - (a.timestamp?.getTime() ?? 0),
        );
      cb(notifs);
    },
    (err) => {
      logger.error({
        message: "watchNotificationsForRole snapshot error",
        operationId,
        operation: "notifications.watchNotificationsForRole",
        role,
        ...errorMeta(err),
      });
    },
  );
}

export async function createNotification(
  title: string,
  message: string,
  targetRole: NotificationTargetRole,
  type: NotificationType,
  itemId?: string,
): Promise<void> {
  const operationId = newOperationId();
  try {
    if (itemId) {
      const existing = query(
        collection(db, "notifications"),
        where("type", "==", type),
        where("itemId", "==", itemId),
        where("isRead", "==", false),
      );
      const snap = await getDocs(existing);
      if (!snap.empty) {
        await updateDoc(snap.docs[0].ref, {
          title,
          message,
          timestamp: serverTimestamp(),
        });
        logger.info({
          message: "Notification upserted (dedup)",
          operationId,
          operation: "notifications.createNotification",
          type,
          itemId,
          targetRole,
        });
        return;
      }
    }

    await addDoc(collection(db, "notifications"), {
      title,
      message,
      targetRole,
      type,
      itemId: itemId ?? null,
      isRead: false,
      timestamp: serverTimestamp(),
    });
    logger.info({
      message: "Notification created",
      operationId,
      operation: "notifications.createNotification",
      type,
      itemId,
      targetRole,
    });
  } catch (err: unknown) {
    logger.error({
      message: "Create notification failed",
      operationId,
      operation: "notifications.createNotification",
      type,
      itemId,
      targetRole,
      ...errorMeta(err),
    });
    throw err;
  }
}

export async function markAsRead(id: string): Promise<void> {
  const operationId = newOperationId();
  try {
    await updateDoc(doc(db, "notifications", id), {
      isRead: true,
      readAt: serverTimestamp(),
    });
    logger.info({
      message: "Notification marked as read",
      operationId,
      operation: "notifications.markAsRead",
      notificationId: id,
    });
  } catch (err: unknown) {
    logger.error({
      message: "Mark as read failed",
      operationId,
      operation: "notifications.markAsRead",
      notificationId: id,
      ...errorMeta(err),
    });
    throw err;
  }
}

export async function markAllAsRead(
  role: NotificationTargetRole,
): Promise<void> {
  const operationId = newOperationId();
  try {
    // Must match watchNotificationsForRole's filter (role OR "all"). Scoping this
    // to `targetRole == role` alone would leave every "all" broadcast unread, so
    // they'd reappear the moment the screen refreshed.
    const q = query(
      collection(db, "notifications"),
      where("isRead", "==", false),
    );
    const snap = await getDocs(q);
    const mine = snap.docs.filter((d) => {
      const target = (d.data().targetRole as string) ?? "admin";
      return target === role || target === "all";
    });
    await Promise.all(
      mine.map((d) =>
        updateDoc(d.ref, { isRead: true, readAt: serverTimestamp() }),
      ),
    );
    logger.info({
      message: "All notifications marked as read",
      operationId,
      operation: "notifications.markAllAsRead",
      role,
      count: mine.length,
    });
  } catch (err: unknown) {
    logger.error({
      message: "Mark all as read failed",
      operationId,
      operation: "notifications.markAllAsRead",
      role,
      ...errorMeta(err),
    });
    throw err;
  }
}

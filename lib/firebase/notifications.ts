import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  getDocs,
  doc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './config';
import { AppNotification, NotificationType, NotificationTargetRole } from '@/lib/types/notification';
import { logger } from '@/lib/logger';
import { newOperationId, errorMeta } from './errors';

function toNotification(data: Record<string, unknown>, id: string): AppNotification {
  return {
    id,
    title: (data.title as string) ?? '',
    message: (data.message as string) ?? '',
    targetRole: (data.targetRole as NotificationTargetRole) ?? 'admin',
    type: (data.type as NotificationType) ?? 'general',
    itemId: data.itemId as string | undefined,
    isRead: (data.isRead as boolean) ?? false,
    timestamp: data.timestamp ? (data.timestamp as Timestamp).toDate() : undefined,
    readAt: data.readAt ? (data.readAt as Timestamp).toDate() : undefined,
  };
}

export function watchNotificationsForRole(
  role: NotificationTargetRole,
  cb: (notifications: AppNotification[]) => void
): () => void {
  const operationId = newOperationId();
  const q = query(
    collection(db, 'notifications'),
    where('targetRole', '==', role),
    where('isRead', '==', false)
  );
  return onSnapshot(
    q,
    (snap) => {
      const notifs = snap.docs
        .map((d) => toNotification(d.data() as Record<string, unknown>, d.id))
        .sort((a, b) => (b.timestamp?.getTime() ?? 0) - (a.timestamp?.getTime() ?? 0));
      cb(notifs);
    },
    (err) => {
      logger.error({ message: 'watchNotificationsForRole snapshot error', operationId, operation: 'notifications.watchNotificationsForRole', role, ...errorMeta(err) });
    }
  );
}

export async function createNotification(
  title: string,
  message: string,
  targetRole: NotificationTargetRole,
  type: NotificationType,
  itemId?: string
): Promise<void> {
  const operationId = newOperationId();
  try {
    if (itemId) {
      const existing = query(
        collection(db, 'notifications'),
        where('type', '==', type),
        where('itemId', '==', itemId),
        where('isRead', '==', false)
      );
      const snap = await getDocs(existing);
      if (!snap.empty) {
        await updateDoc(snap.docs[0].ref, { title, message, timestamp: serverTimestamp() });
        logger.info({ message: 'Notification upserted (dedup)', operationId, operation: 'notifications.createNotification', type, itemId, targetRole });
        return;
      }
    }

    await addDoc(collection(db, 'notifications'), {
      title,
      message,
      targetRole,
      type,
      itemId: itemId ?? null,
      isRead: false,
      timestamp: serverTimestamp(),
    });
    logger.info({ message: 'Notification created', operationId, operation: 'notifications.createNotification', type, itemId, targetRole });
  } catch (err: unknown) {
    logger.error({ message: 'Create notification failed', operationId, operation: 'notifications.createNotification', type, itemId, targetRole, ...errorMeta(err) });
    throw err;
  }
}

export async function markAsRead(id: string): Promise<void> {
  const operationId = newOperationId();
  try {
    await updateDoc(doc(db, 'notifications', id), {
      isRead: true,
      readAt: serverTimestamp(),
    });
    logger.info({ message: 'Notification marked as read', operationId, operation: 'notifications.markAsRead', notificationId: id });
  } catch (err: unknown) {
    logger.error({ message: 'Mark as read failed', operationId, operation: 'notifications.markAsRead', notificationId: id, ...errorMeta(err) });
    throw err;
  }
}

export async function markAllAsRead(role: NotificationTargetRole): Promise<void> {
  const operationId = newOperationId();
  try {
    const q = query(
      collection(db, 'notifications'),
      where('targetRole', '==', role),
      where('isRead', '==', false)
    );
    const snap = await getDocs(q);
    await Promise.all(
      snap.docs.map((d) =>
        updateDoc(d.ref, { isRead: true, readAt: serverTimestamp() })
      )
    );
    logger.info({ message: 'All notifications marked as read', operationId, operation: 'notifications.markAllAsRead', role, count: snap.docs.length });
  } catch (err: unknown) {
    logger.error({ message: 'Mark all as read failed', operationId, operation: 'notifications.markAllAsRead', role, ...errorMeta(err) });
    throw err;
  }
}

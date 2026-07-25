export type NotificationType =
  | "low_stock"
  | "expiry"
  | "recipe_prepared"
  | "inspection_alert"
  | "out_of_stock"
  | "staff_login"
  | "staff_logout"
  | "general";

/**
 * Who a notification is for. `all` is a broadcast that both roles see - the web
 * app has always written these, but this type only had 'admin' | 'staff', so the
 * mobile app had no way to represent (or receive) one. Stock and expiry alerts
 * are broadcasts: staff are the people who actually restock.
 *
 * Readers must match `targetRole === role || targetRole === 'all'`.
 */
export type NotificationTargetRole = "admin" | "staff" | "all";

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  targetRole: NotificationTargetRole;
  type: NotificationType;
  itemId?: string;
  isRead: boolean;
  timestamp?: Date;
  readAt?: Date;
}

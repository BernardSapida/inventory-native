export type NotificationType =
  | 'low_stock'
  | 'expiry'
  | 'recipe_prepared'
  | 'inspection_alert'
  | 'out_of_stock'
  | 'general';

export type NotificationTargetRole = 'admin' | 'staff';

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

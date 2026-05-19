export type UserRole = 'admin' | 'staff';

export interface AppUser {
  uid: string;
  email: string;
  fullName: string;
  role: UserRole;
  phoneNumber: string;
  unitPreference: string;
  isActive: boolean;
  shiftOn: boolean;
  isArchived: boolean;
  permissions: Record<string, boolean>;
  createdAt?: Date;
  lastActive?: Date;
  archivedAt?: Date;
}

export const DEFAULT_PERMISSIONS: Record<string, Record<string, boolean>> = {
  admin: {
    inventoryView: true,
    inventoryAdjust: true,
    recipePrepare: true,
    inspectionSubmit: true,
    notificationsView: true,
    forecastView: true,
    staffManage: true,
  },
  staff: {
    inventoryView: true,
    inventoryAdjust: true,
    recipePrepare: true,
    inspectionSubmit: true,
    notificationsView: true,
    forecastView: false,
    staffManage: false,
  },
};

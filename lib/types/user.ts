export type UserRole = 'admin' | 'staff';

// A brand-new signup starts 'pending' and is blocked from logging in until an
// admin approves it (web Settings > Users). isActive/isArchived stay separate -
// they're the admin's post-approval on/off toggle, not the initial gate.
export type UserStatus = 'pending' | 'active' | 'rejected';

export interface AppUser {
  uid: string;
  email: string;
  fullName: string;
  role: UserRole;
  status: UserStatus;
  phoneNumber: string;
  unitPreference: string;
  isActive: boolean;
  shiftOn: boolean;
  isArchived: boolean;
  // True for accounts created with a shared/temporary password (e.g. the
  // Firebase project migration) - forces a change-password screen on next
  // login instead of the app. False for normal self-service signups, who
  // already picked their own password.
  mustChangePassword: boolean;
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

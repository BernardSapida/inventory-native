import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './config';
import { SpoonDefault, setSpoonDefaults } from '@/lib/types/product';
import { logger } from '@/lib/logger';
import { errorMeta, newOperationId } from './errors';

/**
 * Subscribe to the global spoon-conversion table the admin web writes at
 * `system_config/app`, and push it into the units module so mobile recipe math
 * resolves the SAME densities as the web (see smartstock-admin
 * src/features/settings/settings.ts `useSyncSpoonDefaults`).
 *
 * On any error (e.g. Firestore rules not yet allowing staff to read
 * `system_config`) we simply leave the built-in seed in force, so conversions
 * keep working - they just won't reflect the admin's edits until reads are
 * permitted. Requires Firestore rules to allow authenticated reads of
 * `system_config/app`.
 */
export function watchSpoonDefaults(): () => void {
  const operationId = newOperationId();
  return onSnapshot(
    doc(db, 'system_config', 'app'),
    (snap) => {
      const data = snap.exists() ? snap.data() : undefined;
      const list = (data?.spoonDefaults as SpoonDefault[] | undefined) ?? null;
      setSpoonDefaults(list);
    },
    (err) => {
      logger.error({
        message: 'watchSpoonDefaults snapshot error',
        operationId,
        operation: 'settings.watchSpoonDefaults',
        ...errorMeta(err),
      });
    }
  );
}

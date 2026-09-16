import {
  cleanupFixtures,
  isProvisioningEnabled,
  readFixtureCleanupState,
  readFixtureManifest,
} from './provision';

export default async function globalTeardown() {
  if (isProvisioningEnabled() && (readFixtureManifest() || readFixtureCleanupState())) {
    await cleanupFixtures();
  }
}
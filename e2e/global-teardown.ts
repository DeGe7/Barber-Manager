import { cleanupFixtures, isProvisioningEnabled, readFixtureManifest } from './provision';

export default async function globalTeardown() {
  if (isProvisioningEnabled() && readFixtureManifest()) await cleanupFixtures();
}
import { provisionFixtures } from './provision';

export default async function globalSetup() {
  await provisionFixtures();
}
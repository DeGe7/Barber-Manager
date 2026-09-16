import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function parseTestDiscoveryOutput(output) {
  return output
    .split(/\r?\n/)
    .filter((line) => line.includes(' › '))
    .map((line) => {
      const trimmedLine = line.trim();
      const firstSeparatorIndex = trimmedLine.indexOf(' › ');
      const secondSeparatorIndex = trimmedLine.indexOf(
        ' › ',
        firstSeparatorIndex + 3,
      );
      const separatorIndex =
        secondSeparatorIndex === -1
          ? firstSeparatorIndex
          : secondSeparatorIndex;

      return {
        location: trimmedLine.slice(0, separatorIndex),
        title: trimmedLine.slice(separatorIndex + 3),
      };
    });
}

export function findDuplicateTestTitles(testCases) {
  const testLocationsByTitle = new Map();

  for (const { location, title } of testCases) {
    const locations = testLocationsByTitle.get(title) ?? [];
    locations.push(location);
    testLocationsByTitle.set(title, locations);
  }

  return [...testLocationsByTitle.entries()].filter(
    ([, locations]) => locations.length > 1,
  );
}

export function formatDuplicateTitleReport(duplicateTitles) {
  const report = ['Duplicate Playwright test titles found:'];

  for (const [title, locations] of duplicateTitles) {
    report.push(`  ${title}`);
    for (const location of locations) {
      report.push(`    - ${location}`);
    }
  }

  return report.join('\n');
}

function main() {
  const result = spawnSync(
    'pnpm',
    ['exec', 'playwright', 'test', '--config=e2e/playwright.config.ts', '--list'],
    {
      encoding: 'utf8',
    },
  );

  if (result.error) {
    console.error(`Unable to list Playwright tests: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }

  const testCases = parseTestDiscoveryOutput(result.stdout);
  const duplicateTitles = findDuplicateTestTitles(testCases);

  if (duplicateTitles.length > 0) {
    console.error(formatDuplicateTitleReport(duplicateTitles));
    process.exit(1);
  }

  console.log(`E2E structure is valid: ${testCases.length} test titles checked.`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
  main();
}
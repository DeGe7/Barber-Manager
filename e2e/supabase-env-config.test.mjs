import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requiredTestVariables = [
  'E2E_SUPABASE_TEST_URL',
  'E2E_SUPABASE_TEST_ANON_KEY',
];
const testSupabaseUrl = 'https://isolated-e2e-project.supabase.co';
const testSupabaseKey = 'e2e-anon-key-for-config-test';

function readPackage(artifactName) {
  return JSON.parse(
    readFileSync(
      join(workspaceRoot, 'artifacts', artifactName, 'package.json'),
      'utf8',
    ),
  );
}

function readArtifactConfig(artifactName) {
  return readFileSync(
    join(
      workspaceRoot,
      'artifacts',
      artifactName,
      '.replit-artifact',
      'artifact.toml',
    ),
    'utf8',
  );
}

function sectionBody(toml, sectionName) {
  const lines = toml.split(/\r?\n/);
  const header = `[${sectionName}]`;
  const start = lines.findIndex((line) => line.trim() === header);

  assert.notEqual(start, -1, `Missing TOML section [${sectionName}]`);
  const end = lines.findIndex(
    (line, index) => index > start && /^\s*\[/.test(line),
  );
  return lines.slice(start + 1, end === -1 ? undefined : end).join('\n');
}

function runDevCommand(artifactName, packageJson, missingVariable) {
  const tempDir = mkdtempSync(join(tmpdir(), 'supabase-env-test-'));
  const binDir = join(tempDir, 'bin');
  mkdirSync(binDir);

  const executable = artifactName === 'barber-manager' ? 'vite' : 'pnpm';
  const fakeCommand = [
    '#!/bin/sh',
    'printf "%s|%s\\\\n" "$VITE_SUPABASE_URL" "$VITE_SUPABASE_ANON_KEY"',
  ].join('\n');
  const executablePath = join(binDir, executable);
  writeFileSync(executablePath, fakeCommand);
  chmodSync(executablePath, 0o755);

  const env = {
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    VITE_SUPABASE_URL: 'https://production-project.invalid',
    VITE_SUPABASE_ANON_KEY: 'production-key-must-not-win',
    E2E_SUPABASE_TEST_URL: testSupabaseUrl,
    E2E_SUPABASE_TEST_ANON_KEY: testSupabaseKey,
  };
  if (missingVariable) delete env[missingVariable];

  try {
    return spawnSync('sh', ['-c', packageJson.scripts.dev], {
      cwd: join(workspaceRoot, 'artifacts', artifactName),
      env,
      encoding: 'utf8',
    });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

test('the artifact development commands run the package scripts that enforce E2E Supabase', () => {
  const expectedCommands = [
    ['barber-manager', 'pnpm --filter @workspace/barber-manager run dev'],
    ['api-server', 'pnpm --filter @workspace/api-server run dev'],
  ];

  for (const [artifactName, expectedCommand] of expectedCommands) {
    assert.equal(
      sectionBody(readArtifactConfig(artifactName), 'services.development')
        .match(/^run\s*=\s*"([^"]+)"\s*$/m)?.[1],
      expectedCommand,
      `${artifactName} preview must use its package dev script`,
    );
  }
});

test('frontend and API dev commands override production aliases with E2E Supabase values', () => {
  for (const artifactName of ['barber-manager', 'api-server']) {
    const result = runDevCommand(artifactName, readPackage(artifactName));

    assert.equal(result.status, 0, result.stderr);
    assert.match(
      result.stdout,
      new RegExp(
        `${testSupabaseUrl.replaceAll('.', '\\.')}` +
          `\\|${testSupabaseKey}\\s`,
      ),
      `${artifactName} dev must pass the test project URL and key to its command`,
    );
    assert.doesNotMatch(result.stdout, /production-project\.invalid/);
    assert.doesNotMatch(result.stdout, /production-key-must-not-win/);
  }
});

test('both dev commands fail clearly when either required E2E variable is missing', () => {
  for (const artifactName of ['barber-manager', 'api-server']) {
    for (const missingVariable of requiredTestVariables) {
      const result = runDevCommand(
        artifactName,
        readPackage(artifactName),
        missingVariable,
      );

      assert.notEqual(
        result.status,
        0,
        `${artifactName} dev should fail when ${missingVariable} is missing`,
      );
      assert.match(
        result.stderr,
        new RegExp(`${missingVariable} is required for preview`),
      );
    }
  }
});

test('production artifact commands and package scripts do not receive E2E variables', () => {
  for (const artifactName of ['barber-manager', 'api-server']) {
    const config = readArtifactConfig(artifactName);
    const productionConfig = config.slice(
      config.indexOf('[services.production]'),
    );
    const packageJson = readPackage(artifactName);

    assert.notEqual(
      config.indexOf('[services.production]'),
      -1,
      `${artifactName} must declare production settings`,
    );
    assert.doesNotMatch(
      productionConfig,
      /E2E_SUPABASE_TEST_(?:URL|ANON_KEY)/,
      `${artifactName} production settings must not set E2E variables`,
    );

    for (const scriptName of ['build', 'serve', 'start']) {
      const command = packageJson.scripts[scriptName];
      if (command) {
        assert.doesNotMatch(
          command,
          /E2E_SUPABASE_TEST_(?:URL|ANON_KEY)/,
          `${artifactName} production script "${scriptName}" must not use E2E variables`,
        );
      }
    }
  }
});

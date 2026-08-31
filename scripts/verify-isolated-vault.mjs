import { readFile, realpath, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const EXPECTED_PLUGIN_ID = 'deepseek-harness-workbench';
const EXPECTED_VAULT_NAME = 'obsidian-dsh-workbench-evidence';
const FORBIDDEN_VAULT_NAME = 'obsidian-trend-radar-evidence';

class PreflightError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

try {
  const registryPath = parseArguments(process.argv.slice(2));
  const result = await verifyIsolatedVault(registryPath ?? resolveDefaultRegistryPath());
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  const code = error instanceof PreflightError ? error.code : 'preflight_internal_error';
  process.stderr.write(`${JSON.stringify({
    schemaVersion: 1,
    status: 'blocked',
    mode: 'dry-run',
    code,
  })}\n`);
  process.exitCode = 1;
}

async function verifyIsolatedVault(registryPath) {
  if (!path.isAbsolute(registryPath)) {
    throw new PreflightError('registry_path_not_absolute');
  }

  const registry = await readRegistry(registryPath);
  const registeredPaths = readRegisteredVaultPaths(registry);
  const dedicatedPaths = registeredPaths.filter(
    (registeredPath) => path.basename(path.normalize(registeredPath)) === EXPECTED_VAULT_NAME,
  );

  if (dedicatedPaths.length === 0) {
    const hasForbiddenVault = registeredPaths.some(
      (registeredPath) => path.basename(path.normalize(registeredPath)) === FORBIDDEN_VAULT_NAME,
    );
    throw new PreflightError(hasForbiddenVault ? 'forbidden_vault' : 'dedicated_vault_not_found');
  }
  if (dedicatedPaths.length !== 1) {
    throw new PreflightError('dedicated_vault_ambiguous');
  }

  const configuredVaultPath = dedicatedPaths[0];
  if (configuredVaultPath === undefined || !path.isAbsolute(configuredVaultPath)) {
    throw new PreflightError('vault_path_not_absolute');
  }
  if (hasParentTraversal(configuredVaultPath)) {
    throw new PreflightError('vault_path_escape');
  }

  const vaultPath = path.resolve(configuredVaultPath);
  await requireDirectory(vaultPath, 'dedicated_vault_unavailable');
  const canonicalVaultPath = await canonicalize(vaultPath, 'dedicated_vault_unavailable');
  if (
    !samePath(vaultPath, canonicalVaultPath)
    || path.basename(canonicalVaultPath) !== EXPECTED_VAULT_NAME
  ) {
    throw new PreflightError('vault_path_alias_rejected');
  }

  const obsidianDirectory = await requireConfinedDirectory(
    canonicalVaultPath,
    path.join(canonicalVaultPath, '.obsidian'),
    'obsidian_directory_unavailable',
  );
  const pluginDirectory = await requireConfinedDirectory(
    obsidianDirectory,
    path.join(obsidianDirectory, 'plugins', EXPECTED_PLUGIN_ID),
    'plugin_directory_unavailable',
  );
  const manifestPath = path.join(pluginDirectory, 'manifest.json');
  await requireFile(manifestPath, 'plugin_manifest_unavailable');
  const canonicalManifestPath = await canonicalize(manifestPath, 'plugin_manifest_unavailable');
  if (!samePath(manifestPath, canonicalManifestPath) || !isStrictlyInside(pluginDirectory, canonicalManifestPath)) {
    throw new PreflightError('plugin_path_escape');
  }

  const manifest = await readJson(manifestPath, 'plugin_manifest_invalid');
  if (!isRecord(manifest) || manifest.id !== EXPECTED_PLUGIN_ID) {
    throw new PreflightError('plugin_id_mismatch');
  }

  return {
    schemaVersion: 1,
    status: 'ready',
    mode: 'dry-run',
    source: 'obsidian-desktop-vault-registry',
    vault: {
      name: EXPECTED_VAULT_NAME,
      path: '[redacted]',
    },
    plugin: {
      id: EXPECTED_PLUGIN_ID,
      manifest: 'verified',
    },
    guards: {
      vaultWrite: 'not-authorized',
      automaticUiInteraction: 'not-authorized',
      otherPluginVault: 'rejected',
    },
    checklist: [
      { id: 'registry-source', result: 'passed' },
      { id: 'dedicated-vault-identity', result: 'passed' },
      { id: 'canonical-path-confinement', result: 'passed' },
      { id: 'plugin-manifest-id', result: 'passed' },
      { id: 'default-read-only', result: 'passed' },
    ],
  };
}

function parseArguments(args) {
  let registryPath;
  let dryRunSeen = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--write') throw new PreflightError('vault_write_not_authorized');
    if (argument === '--dry-run') {
      if (dryRunSeen) throw new PreflightError('duplicate_argument');
      dryRunSeen = true;
      continue;
    }
    if (argument === '--obsidian-config') {
      if (registryPath !== undefined) throw new PreflightError('duplicate_argument');
      const value = args[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new PreflightError('missing_argument_value');
      }
      registryPath = value;
      index += 1;
      continue;
    }
    throw new PreflightError('unsupported_argument');
  }

  return registryPath;
}

function resolveDefaultRegistryPath() {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA;
    if (appData === undefined || appData.length === 0) {
      throw new PreflightError('registry_source_unavailable');
    }
    return path.join(appData, 'obsidian', 'obsidian.json');
  }

  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'obsidian', 'obsidian.json');
  }

  const configRoot = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config');
  return path.join(configRoot, 'obsidian', 'obsidian.json');
}

async function readRegistry(registryPath) {
  await requireFile(registryPath, 'registry_unavailable');
  return readJson(registryPath, 'registry_invalid');
}

function readRegisteredVaultPaths(registry) {
  if (!isRecord(registry) || !isRecord(registry.vaults)) {
    throw new PreflightError('registry_invalid');
  }

  const registeredPaths = [];
  for (const entry of Object.values(registry.vaults)) {
    if (!isRecord(entry) || typeof entry.path !== 'string' || entry.path.length === 0) {
      throw new PreflightError('registry_invalid');
    }
    registeredPaths.push(entry.path);
  }
  return registeredPaths;
}

async function requireConfinedDirectory(parentPath, candidatePath, unavailableCode) {
  await requireDirectory(candidatePath, unavailableCode);
  const canonicalCandidatePath = await canonicalize(candidatePath, unavailableCode);
  if (!samePath(candidatePath, canonicalCandidatePath) || !isStrictlyInside(parentPath, canonicalCandidatePath)) {
    throw new PreflightError('plugin_path_escape');
  }
  return canonicalCandidatePath;
}

async function requireDirectory(candidatePath, code) {
  const candidateStat = await readStat(candidatePath, code);
  if (!candidateStat.isDirectory()) throw new PreflightError(code);
}

async function requireFile(candidatePath, code) {
  const candidateStat = await readStat(candidatePath, code);
  if (!candidateStat.isFile()) throw new PreflightError(code);
}

async function readStat(candidatePath, code) {
  try {
    return await stat(candidatePath);
  } catch {
    throw new PreflightError(code);
  }
}

async function canonicalize(candidatePath, code) {
  try {
    return await realpath(candidatePath);
  } catch {
    throw new PreflightError(code);
  }
}

async function readJson(candidatePath, code) {
  try {
    return JSON.parse(await readFile(candidatePath, 'utf8'));
  } catch {
    throw new PreflightError(code);
  }
}

function hasParentTraversal(candidatePath) {
  return candidatePath.replaceAll('\\', '/').split('/').includes('..');
}

function isStrictlyInside(parentPath, candidatePath) {
  const relative = path.relative(parentPath, candidatePath);
  return relative.length > 0 && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

function samePath(left, right) {
  const normalizedLeft = path.normalize(left);
  const normalizedRight = path.normalize(right);
  return process.platform === 'win32'
    ? normalizedLeft.toLocaleLowerCase('en-US') === normalizedRight.toLocaleLowerCase('en-US')
    : normalizedLeft === normalizedRight;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

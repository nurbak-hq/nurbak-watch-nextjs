import { readFileSync } from 'fs';
import { join } from 'path';
import { debugLog } from './utils';

let actionManifest: Map<string, string> | null = null;

export async function loadActionManifest(debug: boolean): Promise<Map<string, string>> {
  if (actionManifest !== null) {
    return actionManifest;
  }

  const manifest = new Map<string, string>();

  try {
    const manifestPath = join(process.cwd(), '.next', 'server', 'server-reference-manifest.json');
    const raw = readFileSync(manifestPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    collectManifestEntries(parsed, manifest);
    debugLog(debug, `Action manifest loaded from filesystem: ${manifest.size} entries`);
  } catch (error) {
    debugLog(debug, 'Could not read server-reference-manifest.json, trying injected manifest.', error);

    const injected = (globalThis as Record<string, unknown>).__NURBAK_ACTION_MANIFEST;
    if (injected && typeof injected === 'object') {
      for (const [key, value] of Object.entries(injected as Record<string, unknown>)) {
        if (typeof value === 'string') {
          manifest.set(key, value);
        }
      }
    }

    debugLog(debug, `Action manifest loaded from memory: ${manifest.size} entries`);
  }

  actionManifest = manifest;

  return actionManifest;
}

export async function resolveActionName(
  actionHash: string,
  debug: boolean
): Promise<string | undefined> {
  const manifest = await loadActionManifest(debug);
  return manifest.get(actionHash);
}

function collectManifestEntries(input: unknown, target: Map<string, string>): void {
  if (!input || typeof input !== 'object') {
    return;
  }

  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value === 'string' && looksLikeActionHash(key)) {
      target.set(key, value);
      continue;
    }

    if (value && typeof value === 'object') {
      const maybeEntry = value as { id?: unknown; name?: unknown };
      if (typeof maybeEntry.id === 'string' && typeof maybeEntry.name === 'string') {
        target.set(maybeEntry.id, maybeEntry.name);
      }

      if (typeof maybeEntry.name === 'string' && looksLikeActionHash(key)) {
        target.set(key, maybeEntry.name);
      }

      collectManifestEntries(value, target);
    }
  }
}

function looksLikeActionHash(value: string): boolean {
  return /^[a-f0-9]{16,}$/i.test(value);
}
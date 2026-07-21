import type { Blueprint } from '../types/blueprint-schema';

export interface UploadBlueprintResult {
  blueprint_id: string;
  message: string;
}

/**
 * Serialises a blueprint exactly as Export does (pretty-printed JSON, no
 * injected fields) and wraps it as the multipart body `/blueprints/upload`
 * expects: a `file` part named `{id}.json`.
 */
export function blueprintToFormData(bp: Blueprint): FormData {
  const blob = new Blob([JSON.stringify(bp, null, 2)], {
    type: 'application/json',
  });
  const formData = new FormData();
  formData.append('file', blob, `${bp.id || 'blueprint'}.json`);
  return formData;
}

/** Checks whether a blueprint id is already stored, to guard against silent overwrite. */
export async function blueprintIdExists(
  apiBaseUrl: string,
  id: string,
): Promise<boolean> {
  const response = await fetch(`${apiBaseUrl}/blueprints`);
  if (!response.ok) {
    throw new Error('Failed to check existing blueprints');
  }
  const blueprints: Array<{ id: string }> = await response.json();
  return blueprints.some((bp) => bp.id === id);
}

/** Posts the blueprint to the orchestrator unmodified. */
export async function uploadBlueprint(
  apiBaseUrl: string,
  bp: Blueprint,
): Promise<UploadBlueprintResult> {
  const response = await fetch(`${apiBaseUrl}/blueprints/upload`, {
    method: 'POST',
    body: blueprintToFormData(bp),
  });
  if (!response.ok) {
    throw new Error(`Save failed (${response.status})`);
  }
  return response.json();
}

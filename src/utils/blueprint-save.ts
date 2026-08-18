import type { Blueprint } from '../types/blueprint-schema';
import type { StartBlueprintResponse } from '../types';

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

/** Starts a session from an already-uploaded blueprint (same call the dashboard's start dialog makes). */
export async function startBlueprintSession(
  apiBaseUrl: string,
  blueprintId: string,
): Promise<StartBlueprintResponse> {
  const response = await fetch(`${apiBaseUrl}/blueprints/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      blueprint_id: blueprintId,
      broker_host: import.meta.env.VITE_MQTT_BROKER_HOST || '127.0.0.1',
      broker_port: parseInt(import.meta.env.VITE_MQTT_BROKER_PORT || '1883'),
    }),
  });
  if (!response.ok) {
    throw new Error(`Failed to start session (${response.status})`);
  }
  return response.json();
}

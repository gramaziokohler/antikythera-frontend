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

/**
 * Turns a failed orchestrator response into a message that says what is wrong.
 *
 * `/blueprints/upload` rejects a blueprint whose conditions read names no task
 * produces, and puts the specific problems in `detail.problems` — the only place
 * the author can find out which task and which expression. Reporting just the
 * status code (as this did) left an author staring at "Save failed (400)" with no
 * way to tell a malformed condition from an unreachable server.
 */
async function describeFailure(response: Response, fallback: string): Promise<string[]> {
  let detail: unknown;
  try {
    detail = (await response.json())?.detail;
  } catch {
    // Not a JSON body (a proxy error page, say) — the status is all there is.
  }

  if (typeof detail === 'string' && detail) return [detail];

  if (detail && typeof detail === 'object') {
    const { message, problems } = detail as { message?: string; problems?: unknown };
    const lines = typeof message === 'string' && message ? [message] : [];
    if (Array.isArray(problems)) lines.push(...problems.map(String));
    if (lines.length) return lines;
  }

  return [`${fallback} (${response.status})`];
}

/** Raised when the orchestrator rejects a blueprint, carrying its per-problem detail. */
export class OrchestratorError extends Error {
  problems: string[];

  constructor(problems: string[]) {
    super(problems.join(' · '));
    this.name = 'OrchestratorError';
    this.problems = problems;
  }
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
    throw new OrchestratorError(await describeFailure(response, 'Save failed'));
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
    throw new OrchestratorError(await describeFailure(response, 'Failed to start session'));
  }
  return response.json();
}

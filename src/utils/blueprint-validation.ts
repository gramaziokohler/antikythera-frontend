import Ajv from 'ajv';
import type { ErrorObject } from 'ajv';
import schema from '../schemas/blueprint.v1.schema.json';
import type { Blueprint } from '../types/blueprint';

/**
 * Runtime validation of blueprint JSON against the canonical schema.
 *
 * The schema (src/schemas/blueprint.v1.schema.json) is the single source of
 * truth for the blueprint data model — the same file the generated TypeScript
 * types in ../types/blueprint.ts are derived from. Validating here enforces the
 * contract at the editor boundary so malformed or unexpected blueprints are
 * rejected on import instead of being silently mangled on export.
 */

const ajv = new Ajv({ allErrors: true, strict: false });
const validateFn = ajv.compile<Blueprint>(schema);

export interface BlueprintValidationResult {
  valid: boolean;
  /** Human-readable messages, one per schema violation. Empty when valid. */
  errors: string[];
  /** The input narrowed to Blueprint when valid, otherwise null. */
  blueprint: Blueprint | null;
}

function formatError(err: ErrorObject): string {
  const path = err.instancePath || '(root)';
  return `${path} ${err.message ?? 'is invalid'}`.trim();
}

/**
 * Validate an arbitrary parsed JSON value against the blueprint schema.
 *
 * Accepts already-parsed data (not a JSON string) so callers control parse-error
 * handling separately from schema violations.
 */
export function validateBlueprint(data: unknown): BlueprintValidationResult {
  if (validateFn(data)) {
    return { valid: true, errors: [], blueprint: data };
  }
  const errors = (validateFn.errors ?? []).map(formatError);
  return {
    valid: false,
    errors: errors.length ? errors : ['Blueprint does not match the expected schema.'],
    blueprint: null,
  };
}

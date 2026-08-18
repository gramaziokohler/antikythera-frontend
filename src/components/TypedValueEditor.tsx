import { useState } from 'react';
import type { ReactNode } from 'react';
import { X, Plus } from 'lucide-react';

/**
 * ADR-0003's type-driven output value editor, all three tiers. Shared between the authoring
 * tool's TaskEditPanel (authoring a simulated default) and the session monitor's
 * SimulationBreakpointPanel (issue-sim-06: editing a held task's simulated output) — kept out of
 * either component's own file so neither one exports anything but its component (Fast Refresh
 * requires a component file to export only components).
 */

// Tier 1: native types render as a type-appropriate input.
const TIER1_OUTPUT_TYPES = ['str', 'int', 'float', 'bool', 'timestamp'] as const;
type Tier1OutputType = (typeof TIER1_OUTPUT_TYPES)[number];

function isTier1OutputType(type: string | undefined): type is Tier1OutputType {
  return !!type && (TIER1_OUTPUT_TYPES as readonly string[]).includes(type);
}

// Tier 2: list[T] repeats the tier-1 or tier-3 editor for T.
function parseListElementType(type: string | undefined): string | undefined {
  if (!type) return undefined;
  const match = /^list\[(.*)\]$/.exec(type.trim());
  return match ? match[1].trim() : undefined;
}

function renderTier1Editor(type: Tier1OutputType, value: unknown, onChange: (value: unknown) => void): ReactNode {
  switch (type) {
    case 'str':
      return (
        <input
          className="tep-input field-value"
          placeholder="value"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'int':
      return (
        <input
          className="tep-input field-value"
          type="number"
          step={1}
          placeholder="value"
          value={typeof value === 'number' ? value : ''}
          onChange={(e) =>
            onChange(e.target.value === '' ? undefined : parseInt(e.target.value, 10))
          }
        />
      );
    case 'float':
      return (
        <input
          className="tep-input field-value"
          type="number"
          step="any"
          placeholder="value"
          value={typeof value === 'number' ? value : ''}
          onChange={(e) =>
            onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))
          }
        />
      );
    case 'bool':
      return (
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
        />
      );
    case 'timestamp':
      return (
        <input
          className="tep-input field-value"
          type="datetime-local"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
        />
      );
  }
}

function valueToJsonText(value: unknown): string {
  return value === undefined ? '' : JSON.stringify(value, null, 2);
}

/**
 * Tier 3: any dotted class path (e.g. `compas.geometry.Frame`), `dict`, and — per ADR-0003 —
 * any unrecognised, malformed or missing type all degrade to this JSON textarea, so no declared
 * type can leave an author without an editor. Keeps its own text state so invalid JSON can be
 * typed and reported inline without corrupting the last-valid stored value (`onChange` is only
 * called once the text parses).
 */
function JsonValueEditor({ value, onChange }: { value: unknown; onChange: (value: unknown) => void }) {
  // Adjusting state during render (rather than in a useEffect) when a prop changes is the
  // React-sanctioned pattern for this — see https://react.dev/reference/react/useState#storing-information-from-previous-renders.
  const [prevValue, setPrevValue] = useState(value);
  const [text, setText] = useState(() => valueToJsonText(value));
  const [error, setError] = useState<string | null>(null);

  if (value !== prevValue) {
    setPrevValue(value);
    setText(valueToJsonText(value));
    setError(null);
  }

  const handleChange = (raw: string) => {
    setText(raw);
    if (raw.trim() === '') {
      setError(null);
      setPrevValue(undefined);
      onChange(undefined);
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      setError(null);
      setPrevValue(parsed);
      onChange(parsed);
    } catch {
      // Invalid JSON: report inline, leave the last valid value (and the stored blueprint)
      // untouched until the text parses again.
      setError('Invalid JSON');
    }
  };

  return (
    <div className="tep-json-editor">
      <textarea
        className={`tep-input tep-textarea tep-json-textarea${error ? ' tep-json-invalid' : ''}`}
        placeholder='{"dtype": "...", "data": {...}}'
        value={text}
        onChange={(e) => handleChange(e.target.value)}
      />
      {error && <span className="tep-json-error">{error}</span>}
    </div>
  );
}

/** Tier 2: repeats the tier-1 or tier-3 editor for `elementType`, with add and remove. */
function ListValueEditor({
  elementType,
  value,
  onChange,
}: {
  elementType: string;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const items: unknown[] = Array.isArray(value) ? value : [];

  const updateItem = (i: number, itemValue: unknown) => {
    onChange(items.map((v, idx) => (idx === i ? itemValue : v)));
  };
  const removeItem = (i: number) => {
    onChange(items.filter((_, idx) => idx !== i));
  };
  const addItem = () => {
    onChange([...items, undefined]);
  };

  return (
    <div className="tep-list-editor">
      {items.map((item, i) => (
        <div className="tep-list-item" key={i}>
          <div className="tep-list-item-value">
            <TypedValueEditor type={elementType} value={item} onChange={(v) => updateItem(i, v)} />
          </div>
          <button className="tep-del-btn" onClick={() => removeItem(i)} title="Remove item">
            <X size={12} />
          </button>
        </div>
      ))}
      <button className="tep-add-btn" onClick={addItem}>
        <Plus size={12} />
        Add item
      </button>
    </div>
  );
}

/**
 * Renders the ADR-0003 type-driven output editor (all three tiers) for a declared output
 * `type`.
 */
export function TypedValueEditor({
  type,
  value,
  onChange,
}: {
  type: string | undefined;
  value: unknown;
  onChange: (value: unknown) => void;
}): ReactNode {
  const elementType = parseListElementType(type);
  if (elementType !== undefined) {
    return <ListValueEditor elementType={elementType} value={value} onChange={onChange} />;
  }
  if (isTier1OutputType(type)) {
    return renderTier1Editor(type, value, onChange);
  }
  // dict, any dotted class path, and any unrecognised/malformed/missing type.
  return <JsonValueEditor value={value} onChange={onChange} />;
}

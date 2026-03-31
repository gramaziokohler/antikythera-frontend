import { useState, useEffect } from 'react';
import { X, Plus } from 'lucide-react';
import type {
  AuthorNodeData,
  TaskInput,
  TaskOutput,
  TaskParam,
  BlueprintMeta,
} from '../../types/blueprint-schema';
import { KNOWN_TASK_TYPES } from '../../types/blueprint-schema';

/* ------------------------------------------------------------------ */
/*  BlueprintMetaPanel – shown when no node is selected                */
/* ------------------------------------------------------------------ */

interface BlueprintMetaPanelProps {
  meta: BlueprintMeta;
  onMetaChange: (meta: BlueprintMeta) => void;
}

export function BlueprintMetaPanel({ meta, onMetaChange }: BlueprintMetaPanelProps) {
  return (
    <div className="bmp-root">
      <div className="bmp-header">Blueprint Properties</div>
      <div className="bmp-body">
        <div className="bmp-field">
          <label className="bmp-label">Name</label>
          <input
            className="bmp-input"
            placeholder="My Blueprint"
            value={meta.name}
            onChange={(e) => onMetaChange({ ...meta, name: e.target.value })}
          />
        </div>
        <div className="bmp-field">
          <label className="bmp-label">ID</label>
          <input
            className="bmp-input mono"
            placeholder="my-blueprint"
            value={meta.id}
            onChange={(e) => onMetaChange({ ...meta, id: e.target.value })}
          />
        </div>
        <div className="bmp-field">
          <label className="bmp-label">Version</label>
          <input
            className="bmp-input mono"
            placeholder="1.0"
            value={meta.version}
            onChange={(e) => onMetaChange({ ...meta, version: e.target.value })}
          />
        </div>
        <div className="bmp-field">
          <label className="bmp-label">Description</label>
          <textarea
            className="bmp-textarea"
            placeholder="Optional description…"
            value={meta.description}
            onChange={(e) => onMetaChange({ ...meta, description: e.target.value })}
          />
        </div>
        <p className="bmp-hint">
          Click a task node on the canvas to edit its inputs, outputs, and
          parameters. Connect nodes by dragging from the right handle of one
          task to the left handle of another.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  FieldList – reusable table editor for inputs / outputs / params    */
/* ------------------------------------------------------------------ */

type GenericField = { name: string; type?: string; value?: unknown };

interface FieldListProps<T extends GenericField> {
  fields: T[];
  onChange: (updated: T[]) => void;
  showValue?: boolean;
  addLabel: string;
  emptyField: () => T;
}

function FieldList<T extends GenericField>({
  fields,
  onChange,
  showValue = true,
  addLabel,
  emptyField,
}: FieldListProps<T>) {
  const update = (i: number, patch: Partial<T>) => {
    const next = fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f));
    onChange(next);
  };

  const remove = (i: number) => {
    onChange(fields.filter((_, idx) => idx !== i));
  };

  const add = () => {
    onChange([...fields, emptyField()]);
  };

  const valueAsString = (v: unknown): string => {
    if (v === undefined || v === null) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  };

  const parseValue = (raw: string): unknown => {
    if (raw === '') return undefined;
    try { return JSON.parse(raw); } catch { return raw; }
  };

  return (
    <div className="tep-field-list">
      {fields.length > 0 && (
        <div className="tep-field-row-labels">
          <span className="lbl-name">name</span>
          <span className="lbl-type">type</span>
          {showValue && <span className="lbl-value">value</span>}
          <span className="lbl-del" />
        </div>
      )}
      {fields.map((f, i) => (
        <div key={i} className="tep-field-row">
          <input
            className="tep-input field-name"
            placeholder="name"
            value={f.name}
            onChange={(e) => update(i, { name: e.target.value } as Partial<T>)}
          />
          <input
            className="tep-input field-type"
            placeholder="type"
            value={f.type ?? ''}
            onChange={(e) =>
              update(i, { type: e.target.value || undefined } as Partial<T>)
            }
          />
          {showValue && (
            <input
              className="tep-input field-value"
              placeholder="value"
              value={valueAsString(f.value)}
              onChange={(e) =>
                update(i, { value: parseValue(e.target.value) } as Partial<T>)
              }
            />
          )}
          <button className="tep-del-btn" onClick={() => remove(i)} title="Remove">
            <X size={12} />
          </button>
        </div>
      ))}
      <button className="tep-add-btn" onClick={add}>
        <Plus size={12} />
        {addLabel}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  TaskEditPanel – shown when a node is selected                      */
/* ------------------------------------------------------------------ */

interface TaskEditPanelProps {
  nodeId: string;
  data: AuthorNodeData;
  onUpdate: (id: string, newId: string, data: AuthorNodeData) => void;
  onClose: () => void;
}

export function TaskEditPanel({ nodeId, data, onUpdate, onClose }: TaskEditPanelProps) {
  // Local editable state (kept in sync when nodeId changes)
  const [localId, setLocalId] = useState(nodeId);
  const [localData, setLocalData] = useState<AuthorNodeData>(data);
  const [typeMode, setTypeMode] = useState<'select' | 'custom'>(
    KNOWN_TASK_TYPES.includes(data.taskType) ? 'select' : 'custom',
  );

  // Sync when selected node changes
  useEffect(() => {
    setLocalId(nodeId);
    setLocalData(data);
    setTypeMode(KNOWN_TASK_TYPES.includes(data.taskType) ? 'select' : 'custom');
  }, [nodeId, data]);

  // Push changes up on every edit
  const commit = (id: string, d: AuthorNodeData) => {
    onUpdate(nodeId, id, d);
  };

  const handleIdBlur = () => {
    if (localId.trim() && localId !== nodeId) {
      commit(localId.trim(), localData);
    }
  };

  const patchData = (patch: Partial<AuthorNodeData>) => {
    const next = { ...localData, ...patch };
    setLocalData(next);
    commit(localId, next);
  };

  return (
    <div className="tep-root">
      {/* Header */}
      <div className="tep-header">
        <span className="tep-header-title">Edit Task: {nodeId}</span>
        <button className="tep-close-btn" onClick={onClose} title="Close panel">
          <X size={15} />
        </button>
      </div>

      <div className="tep-body">
        {/* ---- Identity ---- */}
        <div className="tep-section">
          <div className="tep-section-title">Identity</div>

          <div className="tep-field">
            <label className="tep-label">Task ID</label>
            <input
              className="tep-input mono"
              value={localId}
              onChange={(e) => setLocalId(e.target.value)}
              onBlur={handleIdBlur}
              onKeyDown={(e) => e.key === 'Enter' && handleIdBlur()}
              placeholder="task-id"
            />
          </div>

          <div className="tep-field">
            <label className="tep-label">Task Type</label>
            {typeMode === 'select' ? (
              <div className="tep-type-row">
                <select
                  className="tep-select"
                  value={localData.taskType}
                  onChange={(e) => {
                    if (e.target.value === '__custom__') {
                      setTypeMode('custom');
                      patchData({ taskType: '' });
                    } else {
                      patchData({ taskType: e.target.value });
                    }
                  }}
                >
                  {KNOWN_TASK_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                  <option value="__custom__">Custom…</option>
                </select>
              </div>
            ) : (
              <div className="tep-type-row">
                <input
                  className="tep-input mono"
                  placeholder="namespace.type"
                  value={localData.taskType}
                  onChange={(e) => patchData({ taskType: e.target.value })}
                />
                <button
                  className="tep-add-btn"
                  style={{ flexShrink: 0 }}
                  onClick={() => {
                    setTypeMode('select');
                    patchData({ taskType: KNOWN_TASK_TYPES[0] });
                  }}
                  title="Switch back to dropdown"
                >
                  ↩
                </button>
              </div>
            )}
          </div>

          <div className="tep-field">
            <label className="tep-label">Description</label>
            <textarea
              className="tep-textarea"
              placeholder="Optional description…"
              value={localData.description}
              onChange={(e) => patchData({ description: e.target.value })}
            />
          </div>

          <div className="tep-field">
            <label className="tep-label">Condition</label>
            <input
              className="tep-input mono"
              placeholder="e.g. result == 'ok'"
              value={localData.condition}
              onChange={(e) => patchData({ condition: e.target.value })}
            />
          </div>
        </div>

        {/* ---- Inputs ---- */}
        <div className="tep-section">
          <div className="tep-section-title">Inputs</div>
          <FieldList<TaskInput>
            fields={localData.inputs}
            onChange={(inputs) => patchData({ inputs })}
            addLabel="Add input"
            emptyField={() => ({ name: '' })}
          />
        </div>

        {/* ---- Outputs ---- */}
        <div className="tep-section">
          <div className="tep-section-title">Outputs</div>
          <FieldList<TaskOutput>
            fields={localData.outputs}
            onChange={(outputs) => patchData({ outputs })}
            addLabel="Add output"
            emptyField={() => ({ name: '' })}
          />
        </div>

        {/* ---- Params ---- */}
        <div className="tep-section">
          <div className="tep-section-title">Parameters</div>
          <FieldList<TaskParam>
            fields={localData.params}
            onChange={(params) => patchData({ params })}
            addLabel="Add param"
            emptyField={() => ({ name: '' })}
          />
        </div>
      </div>
    </div>
  );
}

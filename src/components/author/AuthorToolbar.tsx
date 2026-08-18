import { useRef } from 'react';
import {
  FileJson,
  PlusCircle,
  FolderOpen,
  Download,
  Save,
  AlertCircle,
  CheckCircle2,
  Plus,
  Play,
  Group,
} from 'lucide-react';
import type { BlueprintMeta } from '../../types/blueprint-schema';

export interface SaveStatus {
  kind: 'success' | 'error';
  message: string;
}

interface AuthorToolbarProps {
  meta: BlueprintMeta;
  onMetaChange: (meta: BlueprintMeta) => void;
  onNew: () => void;
  onOpen: (file: File) => void;
  onExport: () => void;
  onSave: () => void;
  isSaving?: boolean;
  saveStatus?: SaveStatus | null;
  onSimulate: () => void;
  isSimulating?: boolean;
  onAddNode: () => void;
  isPlacing?: boolean;
  onGroupIntoScope: () => void;
  /** How many task nodes are selected — a scope needs at least two. */
  selectionCount?: number;
  errors: string[];
}

export function AuthorToolbar({
  meta,
  onMetaChange,
  onNew,
  onOpen,
  onExport,
  onSave,
  isSaving = false,
  saveStatus = null,
  onSimulate,
  isSimulating = false,
  onAddNode,
  isPlacing = false,
  onGroupIntoScope,
  selectionCount = 0,
  errors,
}: AuthorToolbarProps) {
  const canGroup = selectionCount >= 2;
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="author-toolbar">
      {/* Brand */}
      <div className="toolbar-brand">
        <FileJson size={20} />
        <span>Blueprint Author</span>
      </div>

      <div className="toolbar-divider" />

      {/* File actions */}
      <button className="toolbar-btn" onClick={onNew} title="New blueprint">
        <PlusCircle size={14} />
        New
      </button>

      <button
        className="toolbar-btn"
        onClick={() => fileInputRef.current?.click()}
        title="Open existing blueprint JSON"
      >
        <FolderOpen size={14} />
        Open
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            onOpen(f);
            e.target.value = '';
          }
        }}
      />

      <button
        className="toolbar-btn primary"
        onClick={onExport}
        title="Export blueprint as JSON"
      >
        <Download size={14} />
        Export
      </button>

      <button
        className="toolbar-btn primary"
        onClick={onSave}
        disabled={isSaving}
        title="Save blueprint to the orchestrator"
      >
        <Save size={14} />
        {isSaving ? 'Saving…' : 'Save'}
      </button>

      <button
        className="toolbar-btn primary"
        onClick={onSimulate}
        disabled={isSimulating}
        title="Derive a simulation blueprint, upload it, and start a session"
      >
        <Play size={14} />
        {isSimulating ? 'Simulating…' : 'Simulate'}
      </button>

      <div className="toolbar-divider" />

      {/* Add task */}
      <button
        className={`toolbar-btn${isPlacing ? ' primary' : ''}`}
        onClick={onAddNode}
        title={isPlacing ? 'Cancel placement (Esc)' : 'Add a new task node'}
      >
        <Plus size={14} />
        {isPlacing ? 'Placing… (Esc)' : 'Add Task'}
      </button>

      {/* Group a selection into a scope */}
      <button
        className="toolbar-btn"
        onClick={onGroupIntoScope}
        disabled={!canGroup}
        title={
          canGroup
            ? `Wrap the ${selectionCount} selected tasks in a scope (retry / while / skip)`
            : 'Select two or more connected tasks — Shift+drag, or Ctrl/⌘+click — to group them into a scope'
        }
      >
        <Group size={14} />
        {canGroup ? `Group ${selectionCount} into Scope` : 'Group into Scope'}
      </button>

      <div className="toolbar-spacer" />

      {/* Inline blueprint metadata */}
      <div className="toolbar-meta">
        <input
          className="meta-input meta-name"
          placeholder="Blueprint name"
          value={meta.name}
          onChange={(e) => onMetaChange({ ...meta, name: e.target.value })}
        />
        <input
          className="meta-input meta-id"
          placeholder="blueprint-id"
          value={meta.id}
          onChange={(e) => onMetaChange({ ...meta, id: e.target.value })}
        />
        <input
          className="meta-input meta-ver"
          placeholder="1.0"
          value={meta.version}
          onChange={(e) => onMetaChange({ ...meta, version: e.target.value })}
        />
      </div>

      {/* Validation errors */}
      {errors.length > 0 && (
        <div className="toolbar-errors">
          <AlertCircle size={14} />
          <span>{errors.join('  ·  ')}</span>
        </div>
      )}

      {/* Save result */}
      {errors.length === 0 && saveStatus && (
        <div
          className={
            saveStatus.kind === 'success' ? 'toolbar-status success' : 'toolbar-errors'
          }
        >
          {saveStatus.kind === 'success' ? (
            <CheckCircle2 size={14} />
          ) : (
            <AlertCircle size={14} />
          )}
          <span>{saveStatus.message}</span>
        </div>
      )}
    </div>
  );
}

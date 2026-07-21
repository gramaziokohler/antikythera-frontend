import { useState, useCallback } from 'react';
import {
  ReactFlowProvider,
  applyNodeChanges,
  applyEdgeChanges,
  Position,
} from '@xyflow/react';
import type { Node, Edge, NodeChange, EdgeChange } from '@xyflow/react';
import { BlueprintCanvas } from './components/author/BlueprintCanvas';
import { AuthorToolbar } from './components/author/AuthorToolbar';
import { TaskEditPanel, BlueprintMetaPanel } from './components/author/TaskEditPanel';
import type { AuthorNodeData, BlueprintMeta } from './types/blueprint-schema';
import { validateBlueprint } from './utils/blueprint-validation';
import {
  makeEdgeId,
  blueprintToFlow,
  flowToBlueprint,
} from './utils/blueprint-flow';
import { blueprintIdExists, uploadBlueprint } from './utils/blueprint-save';
import './styles/author.css';

const API_BASE_URL = '/api';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function buildDefaultBlueprint(): { nodes: Node[]; edges: Edge[] } {
  const startNode: Node = {
    id: 'start',
    type: 'authorTask',
    position: { x: 80, y: 200 },
    data: {
      taskType: 'system.start',
      description: '',
      condition: '',
      inputs: [],
      outputs: [{ name: 'process_start_time', type: 'timestamp' }],
      params: [],
    } satisfies AuthorNodeData,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    deletable: false,
  };

  const endNode: Node = {
    id: 'end',
    type: 'authorTask',
    position: { x: 480, y: 200 },
    data: {
      taskType: 'system.end',
      description: '',
      condition: '',
      inputs: [],
      outputs: [{ name: 'process_end_time', type: 'timestamp' }],
      params: [],
    } satisfies AuthorNodeData,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    deletable: false,
  };

  return { nodes: [startNode, endNode], edges: [] };
}

function validateFlow(nodes: Node[]): string[] {
  const errors: string[] = [];
  const data = nodes.map((n) => n.data as AuthorNodeData);

  const starts = data.filter((d) => d.taskType === 'system.start');
  const ends = data.filter((d) => d.taskType === 'system.end');

  if (starts.length === 0) errors.push('Missing system.start task');
  else if (starts.length > 1) errors.push('Multiple system.start tasks');
  if (ends.length === 0) errors.push('Missing system.end task');
  else if (ends.length > 1) errors.push('Multiple system.end tasks');

  const emptyTypes = nodes.filter((n) => !(n.data as AuthorNodeData).taskType?.trim());
  if (emptyTypes.length) errors.push(`${emptyTypes.length} task(s) missing type`);

  const ids = nodes.map((n) => n.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) errors.push(`Duplicate task IDs: ${[...new Set(dupes)].join(', ')}`);

  return errors;
}

/* ------------------------------------------------------------------ */
/*  AuthorApp                                                          */
/* ------------------------------------------------------------------ */

const DEFAULT_META: BlueprintMeta = {
  id: 'my-blueprint',
  name: 'My Blueprint',
  version: '1.0',
  description: '',
};

export function AuthorApp() {
  const [nodes, setNodes] = useState<Node[]>(() => buildDefaultBlueprint().nodes);
  const [edges, setEdges] = useState<Edge[]>(() => buildDefaultBlueprint().edges);
  const [meta, setMeta] = useState<BlueprintMeta>(DEFAULT_META);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [isPlacing, setIsPlacing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{
    kind: 'success' | 'error';
    message: string;
  } | null>(null);

  // ---- React Flow change handlers ----

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);

  const onSetEdges = useCallback((updater: (eds: Edge[]) => Edge[]) => {
    setEdges(updater);
  }, []);

  // ---- Node selection ----

  const handleNodeSelect = useCallback((id: string | null) => {
    setSelectedNodeId(id);
  }, []);

  // ---- New blueprint ----

  const handleNew = useCallback(() => {
    const { nodes: n, edges: e } = buildDefaultBlueprint();
    setNodes(n);
    setEdges(e);
    setMeta(DEFAULT_META);
    setSelectedNodeId(null);
    setErrors([]);
  }, []);

  // ---- Open / import ----

  const handleOpen = useCallback(async (file: File) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setErrors(['Failed to parse blueprint file — make sure it is valid JSON.']);
      return;
    }

    // Enforce the shared contract before importing. Rejecting an invalid
    // blueprint here is what prevents the editor from loading fields it does
    // not understand and then dropping them on export.
    const result = validateBlueprint(parsed);
    if (!result.blueprint) {
      setErrors([
        'Blueprint does not match the schema:',
        ...result.errors,
      ]);
      return;
    }

    const bp = result.blueprint;
    const { nodes: n, edges: e } = blueprintToFlow(bp);
    setNodes(n);
    setEdges(e);
    setMeta({
      id: bp.id,
      name: bp.name,
      version: bp.version,
      description: bp.description ?? '',
    });
    setSelectedNodeId(null);
    setErrors([]);
  }, []);

  // ---- Export ----

  const handleExport = useCallback(() => {
    const errs = validateFlow(nodes);
    if (errs.length) {
      setErrors(errs);
      return;
    }
    setErrors([]);
    const bp = flowToBlueprint(nodes, edges, meta);
    const blob = new Blob([JSON.stringify(bp, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${meta.id || 'blueprint'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [nodes, edges, meta]);

  // ---- Save (post the blueprint to the orchestrator, unmodified) ----

  const handleSave = useCallback(async () => {
    const errs = validateFlow(nodes);
    if (errs.length) {
      setErrors(errs);
      setSaveStatus(null);
      return;
    }
    setErrors([]);

    const bp = flowToBlueprint(nodes, edges, meta);

    setIsSaving(true);
    setSaveStatus(null);
    try {
      const exists = await blueprintIdExists(API_BASE_URL, bp.id);
      if (exists) {
        const overwrite = window.confirm(
          `A blueprint with id "${bp.id}" already exists. Overwrite it?`,
        );
        if (!overwrite) {
          setIsSaving(false);
          return;
        }
      }

      const result = await uploadBlueprint(API_BASE_URL, bp);
      setSaveStatus({
        kind: 'success',
        message: result.message || `Saved as "${result.blueprint_id}"`,
      });
    } catch (err) {
      setSaveStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Save failed',
      });
    } finally {
      setIsSaving(false);
    }
  }, [nodes, edges, meta]);

  // ---- Add node ----

  const handleAddNode = useCallback(() => {
    setIsPlacing((prev) => !prev);
  }, []);

  const handlePlaceNode = useCallback((position: { x: number; y: number }) => {
    const id = `task_${Date.now()}`;
    const newNode: Node = {
      id,
      type: 'authorTask',
      position,
      data: {
        taskType: 'system.sleep',
        description: '',
        condition: '',
        inputs: [],
        outputs: [],
        params: [],
      } satisfies AuthorNodeData,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
    setNodes((nds) => [...nds, newNode]);
    setSelectedNodeId(id);
    setIsPlacing(false);
  }, []);

  const handleCancelPlace = useCallback(() => {
    setIsPlacing(false);
  }, []);

  // ---- Delete node ----

  const handleDeleteNode = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelectedNodeId(null);
  }, []);

  // ---- Update node data (from TaskEditPanel) ----

  const handleUpdateNode = useCallback(
    (currentId: string, newId: string, newData: AuthorNodeData) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== currentId) return n;
          return { ...n, id: newId, data: newData };
        }),
      );
      if (newId !== currentId) {
        // Also update any edges referencing the old id
        setEdges((eds) =>
          eds.map((e) => ({
            ...e,
            id:
              e.source === currentId
                ? makeEdgeId(newId, e.target)
                : e.target === currentId
                  ? makeEdgeId(e.source, newId)
                  : e.id,
            source: e.source === currentId ? newId : e.source,
            target: e.target === currentId ? newId : e.target,
          })),
        );
        setSelectedNodeId(newId);
      }
    },
    [],
  );

  // ---- Selected node data ----

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  return (
    <ReactFlowProvider>
      <div className="author-app">
        <AuthorToolbar
          meta={meta}
          onMetaChange={setMeta}
          onNew={handleNew}
          onOpen={handleOpen}
          onExport={handleExport}
          onSave={handleSave}
          isSaving={isSaving}
          saveStatus={saveStatus}
          onAddNode={handleAddNode}
          isPlacing={isPlacing}
          errors={errors}
        />

        <div className="author-main">
          {/* Canvas */}
          <div className="author-canvas">
            <BlueprintCanvas
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onSetEdges={onSetEdges}
              onNodeSelect={handleNodeSelect}
              isPlacing={isPlacing}
              onPlaceNode={handlePlaceNode}
              onCancelPlace={handleCancelPlace}
            />
          </div>

          {/* Right panel */}
          <div className="author-panel">
            {selectedNode ? (
              <TaskEditPanel
                nodeId={selectedNode.id}
                data={selectedNode.data as AuthorNodeData}
                onUpdate={handleUpdateNode}
                onDelete={handleDeleteNode}
                onClose={() => setSelectedNodeId(null)}
              />
            ) : (
              <BlueprintMetaPanel meta={meta} onMetaChange={setMeta} />
            )}
          </div>
        </div>
      </div>
    </ReactFlowProvider>
  );
}

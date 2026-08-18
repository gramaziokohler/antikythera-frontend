import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  ReactFlowProvider,
  applyNodeChanges,
  applyEdgeChanges,
  Position,
} from '@xyflow/react';
import type { Node, Edge, NodeChange, EdgeChange } from '@xyflow/react';
import { BlueprintCanvas } from './components/author/BlueprintCanvas';
import { NODE_WIDTH, NODE_HEIGHT } from './utils/flow-layout';
import { AuthorToolbar } from './components/author/AuthorToolbar';
import { TaskEditPanel, BlueprintMetaPanel } from './components/author/TaskEditPanel';
import { ScopeEditPanel } from './components/author/ScopeEditPanel';
import type {
  AuthorNodeData,
  BlueprintMeta,
  Blueprint,
  ScopeStart,
} from './types/blueprint-schema';
import {
  SCOPE_NODE_PREFIX,
  isScopeNodeId,
  deriveScopes,
  deriveScopeBoundary,
  describePolicy,
  findScope,
  scopeFrames,
  validateScopes,
  withoutTasks,
} from './utils/blueprint-scopes';
import {
  SYSTEM_START_TASK_TYPE,
  SYSTEM_END_TASK_TYPE,
  SYSTEM_SLEEP_TASK_TYPE,
} from './types/blueprint-schema';
import { validateBlueprint } from './utils/blueprint-validation';
import {
  makeEdgeId,
  blueprintToFlow,
  flowToBlueprint,
} from './utils/blueprint-flow';
import {
  blueprintIdExists,
  uploadBlueprint,
  startBlueprintSession,
  OrchestratorError,
} from './utils/blueprint-save';
import { fetchBlueprint } from './utils/blueprint-load';
import {
  deriveSimulationBlueprint,
  stripSimulationDerivation,
} from './utils/blueprint-simulate';
import { markDrivingSimulationSession } from './utils/simulation-session';
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
      taskType: SYSTEM_START_TASK_TYPE,
      description: '',
      condition: '',
      inputs: [],
      outputs: [{ name: 'process_start_time', type_hint: 'timestamp' }],
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
      taskType: SYSTEM_END_TASK_TYPE,
      description: '',
      condition: '',
      inputs: [],
      outputs: [{ name: 'process_end_time', type_hint: 'timestamp' }],
      params: [],
    } satisfies AuthorNodeData,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    deletable: false,
  };

  return { nodes: [startNode, endNode], edges: [] };
}

function validateFlow(nodes: Node[], edges: Edge[]): string[] {
  const errors: string[] = [];
  const data = nodes.map((n) => n.data as AuthorNodeData);

  const starts = data.filter((d) => d.taskType === SYSTEM_START_TASK_TYPE);
  const ends = data.filter((d) => d.taskType === SYSTEM_END_TASK_TYPE);

  if (starts.length === 0) errors.push('Missing system.start task');
  else if (starts.length > 1) errors.push('Multiple system.start tasks');
  if (ends.length === 0) errors.push('Missing system.end task');
  else if (ends.length > 1) errors.push('Multiple system.end tasks');

  const emptyTypes = nodes.filter((n) => !(n.data as AuthorNodeData).taskType?.trim());
  if (emptyTypes.length) errors.push(`${emptyTypes.length} task(s) missing type`);

  const ids = nodes.map((n) => n.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) errors.push(`Duplicate task IDs: ${[...new Set(dupes)].join(', ')}`);

  // Scope pairing and nesting, checked here so an unpairable or interlaced scope
  // is caught in the editor rather than by the orchestrator on upload.
  errors.push(...validateScopes(nodes, edges));

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
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedScopeId, setSelectedScopeId] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [isPlacing, setIsPlacing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{
    kind: 'success' | 'error';
    message: string;
  } | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  // ---- React Flow change handlers ----

  // Scope frames are derived from the task nodes on every render, never stored, so
  // changes React Flow reports for them (dimensions, selection) are dropped rather
  // than applied to the task list they were computed from.
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const taskChanges = changes.filter((c) => !('id' in c) || !isScopeNodeId(c.id));
    if (!taskChanges.length) return;

    // Deletions are routed through withoutTasks so that removing a task with the
    // Delete key cleans up its scope markers, exactly as the edit panel does.
    const removedIds = taskChanges.filter((c) => c.type === 'remove').map((c) => c.id);
    setNodes((nds) => {
      const next = applyNodeChanges(
        taskChanges.filter((c) => c.type !== 'remove'),
        nds,
      );
      return removedIds.length ? withoutTasks(next, removedIds) : next;
    });
    if (removedIds.length) {
      setSelectedScopeId((current) => (current && removedIds.includes(current) ? null : current));
    }
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);

  const onSetEdges = useCallback((updater: (eds: Edge[]) => Edge[]) => {
    setEdges(updater);
  }, []);

  // ---- Selection ----

  const handleSelectionChange = useCallback((ids: string[]) => {
    setSelectedNodeIds(ids);
    // A task and a scope are edited in the same panel slot; selecting either one
    // takes the panel over.
    if (ids.length) setSelectedScopeId(null);
  }, []);

  /** Select a single task from outside the canvas, e.g. the scope's member list. */
  const selectTask = useCallback((taskId: string) => {
    setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === taskId })));
    setSelectedNodeIds([taskId]);
    setSelectedScopeId(null);
  }, []);

  const clearSelection = useCallback(() => {
    setNodes((nds) => nds.map((n) => (n.selected ? { ...n, selected: false } : n)));
    setSelectedNodeIds([]);
    setSelectedScopeId(null);
  }, []);

  const handleSelectScope = useCallback((scopeId: string) => {
    setNodes((nds) => nds.map((n) => (n.selected ? { ...n, selected: false } : n)));
    setSelectedNodeIds([]);
    setSelectedScopeId(scopeId);
  }, []);

  // ---- New blueprint ----

  const handleNew = useCallback(() => {
    const { nodes: n, edges: e } = buildDefaultBlueprint();
    setNodes(n);
    setEdges(e);
    setMeta(DEFAULT_META);
    setSelectedNodeIds([]);
    setSelectedScopeId(null);
    setErrors([]);
  }, []);

  // ---- Open / import ----

  /**
   * Replaces the canvas with a blueprint, whatever it was opened from — a file, or the orchestrator.
   *
   * Validates against the shared schema first, so malformed input is rejected at the editor
   * boundary regardless of source, rather than being loaded with unknown fields and then dropped
   * on export. Then always presents the authored form: a blueprint that came back from a simulated
   * run carries the derivation (`__sim` id, `simulation.`-prefixed types, `__sim_out__` params),
   * and editing that as-is would compound it on the next Simulate. Simulate re-derives from what's
   * on the canvas, so the round trip is lossless.
   */
  const openBlueprint = useCallback((raw: unknown) => {
    const result = validateBlueprint(raw);
    if (!result.blueprint) {
      setErrors(['Blueprint does not match the schema:', ...result.errors]);
      return;
    }
    const bp = stripSimulationDerivation(result.blueprint);
    const { nodes: n, edges: e } = blueprintToFlow(bp);
    setNodes(n);
    setEdges(e);
    setMeta({
      id: bp.id,
      name: bp.name,
      version: bp.version,
      description: bp.description ?? '',
    });
    setSelectedNodeIds([]);
    setSelectedScopeId(null);
    setErrors([]);
  }, []);

  const handleOpen = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        openBlueprint(JSON.parse(text));
      } catch {
        setErrors(['Failed to parse blueprint file — make sure it is valid JSON.']);
      }
    },
    [openBlueprint],
  );

  // ---- Edit a stored blueprint (`/author.html?blueprint=<id>`) ----
  //
  // The dashboard's Edit action hands the tab over by full navigation, the mirror of Simulate
  // going the other way — the two are separate page entry points with no shared in-app router.
  // The id stays in the URL, so a reload reopens the stored blueprint rather than dropping the
  // tab back to an empty canvas.
  const [editingBlueprintId] = useState(
    () => new URLSearchParams(window.location.search).get('blueprint'),
  );

  useEffect(() => {
    if (!editingBlueprintId) return;

    let cancelled = false;
    fetchBlueprint(API_BASE_URL, editingBlueprintId)
      .then((bp) => {
        if (!cancelled) openBlueprint(bp);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrors([err instanceof Error ? err.message : 'Failed to load blueprint']);
      });

    return () => {
      cancelled = true;
    };
  }, [editingBlueprintId, openBlueprint]);

  // ---- Export ----

  const handleExport = useCallback(() => {
    const errs = validateFlow(nodes, edges);
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
    const errs = validateFlow(nodes, edges);
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
      if (err instanceof OrchestratorError) {
        // The rejection detail is per-problem; the errors banner lists them.
        setErrors(err.problems);
        setSaveStatus(null);
      } else {
        setSaveStatus({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Save failed',
        });
      }
    } finally {
      setIsSaving(false);
    }
  }, [nodes, edges, meta]);

  // ---- Simulate (rewrite task types, upload under `{id}__sim`, start a session) ----

  const handleSimulate = useCallback(async () => {
    const errs = validateFlow(nodes, edges);
    if (errs.length) {
      setErrors(errs);
      setSaveStatus(null);
      return;
    }
    setErrors([]);
    setSaveStatus(null);

    const bp = flowToBlueprint(nodes, edges, meta);

    let simBp: Blueprint;
    try {
      simBp = deriveSimulationBlueprint(bp);
    } catch (err) {
      setErrors([
        err instanceof Error ? err.message : 'Failed to prepare simulation',
      ]);
      return;
    }

    setIsSimulating(true);
    try {
      await uploadBlueprint(API_BASE_URL, simBp);
      const { session_id } = await startBlueprintSession(API_BASE_URL, simBp.id);
      markDrivingSimulationSession(session_id, simBp.id);
      // Authoring tool and dashboard are separate page entry points (author.html vs
      // index.html) — a full navigation is the only way to hand the tab over.
      window.location.href = `/?session=${encodeURIComponent(session_id)}`;
    } catch (err) {
      // An orchestrator rejection names the offending task and expression; show
      // each problem rather than folding them into one line.
      setErrors(
        err instanceof OrchestratorError
          ? err.problems
          : [err instanceof Error ? err.message : 'Simulate failed'],
      );
      setIsSimulating(false);
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
        taskType: SYSTEM_SLEEP_TASK_TYPE,
        description: '',
        condition: '',
        inputs: [],
        outputs: [],
        params: [],
      } satisfies AuthorNodeData,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
    setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), { ...newNode, selected: true }]);
    setSelectedNodeIds([id]);
    setSelectedScopeId(null);
    setIsPlacing(false);
  }, []);

  const handleCancelPlace = useCallback(() => {
    setIsPlacing(false);
  }, []);

  // ---- Delete node ----

  const handleDeleteNode = useCallback((nodeId: string) => {
    setNodes((nds) => withoutTasks(nds, [nodeId]));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelectedNodeIds([]);
    setSelectedScopeId((current) => (current === nodeId ? null : current));
  }, []);

  // ---- Update node data (from TaskEditPanel) ----

  const handleUpdateNode = useCallback(
    (currentId: string, newId: string, newData: AuthorNodeData) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === currentId) return { ...n, id: newId, data: newData };
          // scope_end is a task-id reference, so a rename has to be followed
          // through or the scope silently loses its closing task.
          const data = n.data as AuthorNodeData;
          if (newId !== currentId && data.scopeEnd === currentId) {
            return { ...n, data: { ...data, scopeEnd: newId } };
          }
          return n;
        }),
      );
      if (newId !== currentId) {
        setSelectedScopeId((current) => (current === currentId ? newId : current));
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
        setSelectedNodeIds([newId]);
      }
    },
    [],
  );

  // ---- Scopes ----
  //
  // A scope lives on its tasks (a `scope_start` policy on the entry task, a
  // `scope_end` back-reference on the exit task) and its membership is implied by
  // the DAG, so the editor stores nothing extra: the frames below are recomputed
  // from the current nodes and edges, which is also what the orchestrator does.

  const scopes = useMemo(() => deriveScopes(nodes, edges), [nodes, edges]);

  const scopeNodes = useMemo(
    () =>
      scopeFrames(scopes, nodes, { width: NODE_WIDTH, height: NODE_HEIGHT }).map(
        (frame, index) => ({
          id: `${SCOPE_NODE_PREFIX}${frame.scope.id}`,
          type: 'scopeGroup',
          position: { x: frame.x, y: frame.y },
          style: { width: frame.width, height: frame.height },
          data: {
            label: frame.scope.label,
            policyType: frame.scope.policyType,
            policySummary: describePolicy(frame.scope.policy),
            selected: frame.scope.id === selectedScopeId,
            onSelect: () => handleSelectScope(frame.scope.id),
          },
          selectable: false,
          draggable: false,
          deletable: false,
          // Behind the task nodes, outermost scope furthest back.
          zIndex: -100 + index,
        }),
      ),
    [scopes, nodes, selectedScopeId, handleSelectScope],
  );

  const canvasNodes = useMemo(() => [...scopeNodes, ...nodes], [scopeNodes, nodes]);

  /**
   * Turns the selected tasks into a scope.
   *
   * The author picks a region; which task opens and which closes it falls out of
   * the graph (see `deriveScopeBoundary`), so there is no id to type and no way to
   * name a task that is not actually at the boundary.
   */
  const handleGroupIntoScope = useCallback(() => {
    const { boundary, error } = deriveScopeBoundary(selectedNodeIds, nodes, edges);
    if (!boundary) {
      setErrors([error]);
      setSaveStatus(null);
      return;
    }

    const { startId, endId, implied } = boundary;
    setErrors([]);
    setNodes((nds) =>
      nds.map((n) => {
        const data = n.data as AuthorNodeData;
        if (n.id === startId) {
          // An empty policy is the skip scope — it runs once, gated on the entry
          // task's condition. Retry/while are chosen afterwards in the panel.
          return { ...n, selected: false, data: { ...data, scopeStart: {} } };
        }
        if (n.id === endId) return { ...n, selected: false, data: { ...data, scopeEnd: startId } };
        return n.selected ? { ...n, selected: false } : n;
      }),
    );
    setSelectedNodeIds([]);
    setSelectedScopeId(startId);
    setSaveStatus(
      implied.length
        ? {
            kind: 'success',
            message: `Scope also covers ${implied.join(', ')} — every task between '${startId}' and '${endId}' is in it.`,
          }
        : null,
    );
  }, [selectedNodeIds, nodes, edges]);

  const handleScopePolicyChange = useCallback((scopeId: string, policy: ScopeStart) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === scopeId ? { ...n, data: { ...(n.data as AuthorNodeData), scopeStart: policy } } : n,
      ),
    );
  }, []);

  const handleScopeConditionChange = useCallback((taskId: string, condition: string) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === taskId ? { ...n, data: { ...(n.data as AuthorNodeData), condition } } : n,
      ),
    );
  }, []);

  const handleUngroupScope = useCallback((scopeId: string) => {
    setNodes((nds) =>
      nds.map((n) => {
        const data = n.data as AuthorNodeData;
        if (n.id === scopeId) {
          const next = { ...data };
          delete next.scopeStart;
          return { ...n, data: next };
        }
        if (data.scopeEnd === scopeId) {
          const next = { ...data };
          delete next.scopeEnd;
          return { ...n, data: next };
        }
        return n;
      }),
    );
    setSelectedScopeId(null);
  }, []);

  // ---- Panel target ----

  const selectedScope = findScope(scopes, selectedScopeId);
  const selectedNode =
    selectedNodeIds.length === 1
      ? (nodes.find((n) => n.id === selectedNodeIds[0]) ?? null)
      : null;

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
          onSimulate={handleSimulate}
          isSimulating={isSimulating}
          onAddNode={handleAddNode}
          isPlacing={isPlacing}
          onGroupIntoScope={handleGroupIntoScope}
          selectionCount={selectedNodeIds.length}
          errors={errors}
        />

        <div className="author-main">
          {/* Canvas */}
          <div className="author-canvas">
            <BlueprintCanvas
              nodes={canvasNodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onSetEdges={onSetEdges}
              onSelectionChange={handleSelectionChange}
              isPlacing={isPlacing}
              onPlaceNode={handlePlaceNode}
              onCancelPlace={handleCancelPlace}
            />
          </div>

          {/* Right panel */}
          <div className="author-panel">
            {selectedScope ? (
              <ScopeEditPanel
                // Remount per scope so the panel's memory of a discarded policy
                // never carries over to a different scope.
                key={selectedScope.id}
                scope={selectedScope}
                startCondition={
                  (nodes.find((n) => n.id === selectedScope.startId)?.data as AuthorNodeData)
                    ?.condition ?? ''
                }
                onPolicyChange={(policy) => handleScopePolicyChange(selectedScope.id, policy)}
                onStartConditionChange={(condition) =>
                  handleScopeConditionChange(selectedScope.startId, condition)
                }
                onSelectTask={selectTask}
                onUngroup={() => handleUngroupScope(selectedScope.id)}
                onClose={() => setSelectedScopeId(null)}
              />
            ) : selectedNode ? (
              <TaskEditPanel
                nodeId={selectedNode.id}
                data={selectedNode.data as AuthorNodeData}
                onUpdate={handleUpdateNode}
                onDelete={handleDeleteNode}
                onClose={clearSelection}
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

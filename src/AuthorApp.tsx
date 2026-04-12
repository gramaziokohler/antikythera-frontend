import { useState, useCallback } from 'react';
import {
  ReactFlowProvider,
  applyNodeChanges,
  applyEdgeChanges,
  Position,
  MarkerType,
} from '@xyflow/react';
import type { Node, Edge, NodeChange, EdgeChange } from '@xyflow/react';
import {
  BlueprintCanvas,
  getLayoutedElements,
} from './components/author/BlueprintCanvas';
import { AuthorToolbar } from './components/author/AuthorToolbar';
import { TaskEditPanel, BlueprintMetaPanel } from './components/author/TaskEditPanel';
import type {
  AuthorNodeData,
  BlueprintMeta,
  Blueprint,
  BlueprintTask,
} from './types/blueprint-schema';
import './styles/author.css';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeEdgeId(source: string, target: string) {
  return `${source}->${target}`;
}

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

function blueprintToFlow(bp: Blueprint): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = bp.tasks.map((task) => ({
    id: task.id,
    type: 'authorTask',
    position: { x: 0, y: 0 },
    data: {
      taskType: task.type,
      description: task.description ?? '',
      condition: task.condition ?? '',
      inputs: task.inputs ?? [],
      outputs: task.outputs ?? [],
      params: task.params ?? [],
    } satisfies AuthorNodeData,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    deletable: task.type !== 'system.start' && task.type !== 'system.end',
  }));

  const edges: Edge[] = [];
  bp.tasks.forEach((task) => {
    (task.depends_on ?? []).forEach((dep) => {
      edges.push({
        id: makeEdgeId(dep.id, task.id),
        source: dep.id,
        target: task.id,
        type: 'deletable',
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { strokeWidth: 2 },
      });
    });
  });

  // Apply Dagre layout so imported blueprints render cleanly
  return getLayoutedElements(nodes, edges);
}

function flowToBlueprint(
  nodes: Node[],
  edges: Edge[],
  meta: BlueprintMeta,
): Blueprint {
  const tasks: BlueprintTask[] = nodes.map((node) => {
    const d = node.data as AuthorNodeData;

    const depends_on = edges
      .filter((e) => e.target === node.id)
      .map((e) => ({ id: e.source }));

    const task: BlueprintTask = { id: node.id, type: d.taskType };
    if (d.description) task.description = d.description;
    if (d.condition) task.condition = d.condition;

    const inputs = d.inputs.filter((f) => f.name.trim());
    const outputs = d.outputs.filter((f) => f.name.trim());
    const params = d.params.filter((f) => f.name.trim());

    if (inputs.length) task.inputs = inputs;
    if (outputs.length) task.outputs = outputs;
    if (params.length) task.params = params;
    if (depends_on.length) task.depends_on = depends_on;

    return task;
  });

  const bp: Blueprint = {
    version: meta.version || '1.0',
    id: meta.id,
    name: meta.name,
    tasks,
  };
  if (meta.description) bp.description = meta.description;
  return bp;
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
    try {
      const text = await file.text();
      const bp: Blueprint = JSON.parse(text);
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
    } catch {
      setErrors(['Failed to parse blueprint file — make sure it is valid JSON.']);
    }
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

  // ---- Add node ----

  const handleAddNode = useCallback(() => {
    const count = nodes.length;
    const id = `task_${Date.now()}`;
    const newNode: Node = {
      id,
      type: 'authorTask',
      position: {
        x: 200 + (count % 4) * 60,
        y: 80 + count * 130,
      },
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
  }, [nodes.length]);

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
          onAddNode={handleAddNode}
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

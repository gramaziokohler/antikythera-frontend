import { useCallback, useMemo, useState, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  Position,
  MarkerType,
  BackgroundVariant,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useReactFlow,
} from '@xyflow/react';
import type {
  Node,
  Edge,
  NodeChange,
  EdgeChange,
  Connection,
  OnSelectionChangeParams,
  EdgeProps,
} from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import '@xyflow/react/dist/style.css';
import { AuthorTaskNode } from './AuthorTaskNode';

export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 100;

const nodeTypes = { authorTask: AuthorTaskNode };

function DeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  selected,
}: EdgeProps) {
  const { setEdges } = useReactFlow();
  const [hovered, setHovered] = useState(false);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const showDelete = selected || hovered;

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd as string}
        style={style}
        interactionWidth={20}
      />
      {/* Invisible wider path for easier hover detection */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />
      <EdgeLabelRenderer>
        <button
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onClick={() => setEdges((eds) => eds.filter((e) => e.id !== id))}
          title="Remove connection"
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
            width: 18,
            height: 18,
            borderRadius: '50%',
            border: '1px solid #94a3b8',
            background: '#fff',
            color: '#64748b',
            fontSize: 12,
            lineHeight: 1,
            cursor: 'pointer',
            display: showDelete ? 'flex' : 'none',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
        >
          ×
        </button>
      </EdgeLabelRenderer>
    </>
  );
}

const edgeTypes = { deletable: DeletableEdge };

export function getLayoutedElements(nodes: Node[], edges: Edge[]) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', ranksep: 160, nodesep: 60 });

  nodes.forEach((n) => g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);

  return {
    nodes: nodes.map((n) => {
      const pos = g.node(n.id);
      return {
        ...n,
        targetPosition: Position.Left,
        sourcePosition: Position.Right,
        position: {
          x: pos.x - NODE_WIDTH / 2,
          y: pos.y - NODE_HEIGHT / 2,
        },
      };
    }),
    edges,
  };
}

interface BlueprintCanvasProps {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onSetEdges: (updater: (eds: Edge[]) => Edge[]) => void;
  onNodeSelect: (nodeId: string | null) => void;
  isPlacing?: boolean;
  onPlaceNode?: (position: { x: number; y: number }) => void;
  onCancelPlace?: () => void;
}

export function BlueprintCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onSetEdges,
  onNodeSelect,
  isPlacing = false,
  onPlaceNode,
  onCancelPlace,
}: BlueprintCanvasProps) {
  const { screenToFlowPosition } = useReactFlow();
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!isPlacing) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancelPlace?.();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isPlacing, onCancelPlace]);
  const onConnect = useCallback(
    (connection: Connection) => {
      if (isPlacing) return; // ignore while placing
      onSetEdges((eds) =>
        addEdge(
          {
            ...connection,
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { strokeWidth: 2 },
          },
          eds,
        ),
      );
    },
    [onSetEdges],
  );

  const onSelectionChange = useCallback(
    ({ nodes: selectedNodes }: OnSelectionChangeParams) => {
      onNodeSelect(selectedNodes.length > 0 ? selectedNodes[0].id : null);
    },
    [onNodeSelect],
  );

  const handlePaneClick = useCallback(
    (e: React.MouseEvent) => {
      if (!isPlacing || !onPlaceNode) return;
      onPlaceNode(screenToFlowPosition({ x: e.clientX, y: e.clientY }));
    },
    [isPlacing, onPlaceNode, screenToFlowPosition],
  );

  const defaultEdgeOptions = useMemo(
    () => ({
      type: 'deletable',
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { strokeWidth: 2 },
    }),
    [],
  );

  return (
    <div
      style={{ width: '100%', height: '100%', cursor: isPlacing ? 'crosshair' : undefined }}
      onMouseMove={(e) => { if (isPlacing) setMousePos({ x: e.clientX, y: e.clientY }); }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        onPaneClick={handlePaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        deleteKeyCode="Delete"
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: false }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls />
        <MiniMap
          nodeColor={(n) => {
            const taskType = (n.data as any)?.taskType ?? '';
            if (taskType === 'system.start') return '#22c55e';
            if (taskType === 'system.end') return '#ef4444';
            return '#3b82f6';
          }}
          pannable
          zoomable
        />
      </ReactFlow>
      {isPlacing && (
        <div
          style={{
            position: 'fixed',
            left: mousePos.x,
            top: mousePos.y,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            opacity: 0.85,
            zIndex: 9999,
            width: NODE_WIDTH,
            background: 'var(--color-bg-card, #fff)',
            border: '2px dashed #3b82f6',
            borderRadius: 8,
            padding: '8px 12px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
            userSelect: 'none',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 600, color: '#3b82f6' }}>new-task</div>
          <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>Click to place · Esc to cancel</div>
        </div>
      )}
    </div>
  );
}

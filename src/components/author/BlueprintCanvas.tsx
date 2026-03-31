import { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  Position,
  MarkerType,
  BackgroundVariant,
} from '@xyflow/react';
import type {
  Node,
  Edge,
  NodeChange,
  EdgeChange,
  Connection,
  OnSelectionChangeParams,
} from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import '@xyflow/react/dist/style.css';
import { AuthorTaskNode } from './AuthorTaskNode';

export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 100;

const nodeTypes = { authorTask: AuthorTaskNode };

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
}

export function BlueprintCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onSetEdges,
  onNodeSelect,
}: BlueprintCanvasProps) {
  const onConnect = useCallback(
    (connection: Connection) => {
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

  const defaultEdgeOptions = useMemo(
    () => ({
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { strokeWidth: 2 },
    }),
    [],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onSelectionChange={onSelectionChange}
      nodeTypes={nodeTypes}
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
  );
}

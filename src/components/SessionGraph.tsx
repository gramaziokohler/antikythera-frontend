import { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import type { MouseEvent } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  Position,
  MarkerType,
} from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';
import type { GraphData } from '../types';
import { TaskNode } from './graph/TaskNode';

interface SessionGraphProps {
  data: GraphData;
  onNodeSwap?: (sourceId: string, targetId: string) => void;
  activeBlueprintId?: string;
  onNodeContextMenu?: (event: MouseEvent, node: Node) => void;
}

const nodeWidth = 280; // Match TaskNode CSS
const nodeHeight = 150; // Increased estimated height

const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  // Increase default spacing for better readability
  dagreGraph.setGraph({ rankdir: 'LR', ranksep: 200, nodesep: 50 });

  nodes.forEach((node) => {
    // Safely resolve dimensions. Handle 'auto' or missing values.
    let w = node.measured?.width;
    if (typeof w !== 'number') {
      const styleW = node.style?.width;
      w = typeof styleW === 'number' ? styleW : nodeWidth;
    }

    let h = node.measured?.height;
    if (typeof h !== 'number') {
      const styleH = node.style?.height;
      h = typeof styleH === 'number' ? styleH : nodeHeight;
    }

    dagreGraph.setNode(node.id, { width: w || nodeWidth, height: h || nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);

    // Safely resolve dimension for position centering
    let w = node.measured?.width;
    if (typeof w !== 'number') {
      const styleW = node.style?.width;
      w = typeof styleW === 'number' ? styleW : nodeWidth;
    }

    let h = node.measured?.height;
    if (typeof h !== 'number') {
      const styleH = node.style?.height;
      h = typeof styleH === 'number' ? styleH : nodeHeight;
    }

    // Double safety check
    w = w || nodeWidth;
    h = h || nodeHeight;

    return {
      ...node,
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
      position: {
        x: nodeWithPosition.x - w / 2,
        y: nodeWithPosition.y - h / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};
export function SessionGraph({ data, onNodeSwap, onNodeDoubleClick, onNodeContextMenu, activeBlueprintId }: SessionGraphProps & { onNodeDoubleClick?: (event: MouseEvent, node: Node) => void }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [isInteractive, setIsInteractive] = useState(false); // Start locked
  const [rfInstance, setRfInstance] = useState<any>(null);

  // Store viewports: { [blueprintId]: { x, y, zoom } }
  const viewStates = useRef<Record<string, { x: number, y: number, zoom: number }>>({});
  const prevBlueprintIdRef = useRef<string | undefined>(undefined);

  const nodeTypes = useMemo(() => ({
    task: TaskNode
  }), []);

  const refreshLayout = useCallback(() => {
    if (!data) return;
    const initialNodes: Node[] = data.nodes.map((node) => {
      // Pass all properties from the node data to the component
      return {
        id: node.id,
        type: 'task',
        data: {
          id: node.id,
          label: node.label,
          status: node.status,
          details: node.details,
          // We expect these to be in the node object now
          type: node.type,
          description: node.description, // Pass description
          condition: node.condition, // Pass condition
          inputs: node.inputs,
          outputs: node.outputs,
          internalBlueprintId: node.internalBlueprintId,
          onExpand: onNodeDoubleClick // Pass expand handler
        },
        position: { x: 0, y: 0 },
        style: { width: nodeWidth, height: 'auto' }, // Force wrapper dimensions
      };
    });

    const initialEdges: Edge[] = data.edges.map((edge) => ({
      id: `e${edge.source}-${edge.target}`,
      source: edge.source,
      target: edge.target,
      type: 'smoothstep',
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#23395B',
      },
      style: { stroke: '#23395B', strokeWidth: 1.5 },
    }));

    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      initialNodes,
      initialEdges
    );

    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [data, setNodes, setEdges]);

  // Handle Viewport Restore/Fit when blueprint changes
  useEffect(() => {
    if (!rfInstance || !activeBlueprintId || nodes.length === 0) return;

    if (activeBlueprintId !== prevBlueprintIdRef.current) {
      const savedView = viewStates.current[activeBlueprintId];
      if (savedView) {
        rfInstance.setViewport(savedView);
      } else {
        // Only fit view if we don't have a saved state
        // Use a small timeout to ensure nodes are fully rendered/measured by ReactFlow internal
        setTimeout(() => {
          rfInstance.fitView({ padding: 0.2, maxZoom: 1.0 });
        }, 10);
      }
      prevBlueprintIdRef.current = activeBlueprintId;
    }
  }, [activeBlueprintId, rfInstance, nodes]);

  const onMoveEnd = useCallback((_event: any, viewport: any) => {
    if (activeBlueprintId) {
      viewStates.current[activeBlueprintId] = viewport;
    }
  }, [activeBlueprintId]);

  // Update layout when data changes
  useEffect(() => {
    refreshLayout();
  }, [refreshLayout]);

  const onNodeDragStop = useCallback((_: MouseEvent, _node: Node) => {
    // We are not calculating positions manually here, just handling the swap logic
    // The refreshLayout function handles the actual layout
    if (!onNodeSwap) return;

    // ... (rest of drag logic) ...
    // Note: No layout changes happen here directly anymore, they are driven by node/edge state
  }, [nodes, onNodeSwap]); // removed refreshLayout dependency

  // Ensure container has dimensions using absolute positioning trick
  // This is the most reliable way to make React Flow fit a flex parent
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} onContextMenu={(e) => e.preventDefault()}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeContextMenu={onNodeContextMenu}
        onInit={setRfInstance}
        onMoveEnd={onMoveEnd}
        minZoom={0.1}
        maxZoom={1.5}
        nodeExtent={undefined}
        nodesDraggable={isInteractive}
        nodesConnectable={isInteractive}
        elementsSelectable={isInteractive}
      >
        <Background color="#ccc" gap={20} />
        <Controls
          onInteractiveChange={setIsInteractive}
        />
      </ReactFlow>
    </div>
  );
}

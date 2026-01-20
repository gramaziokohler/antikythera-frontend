import { useEffect, useCallback } from 'react';
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

interface SessionGraphProps {
  data: GraphData;
  onNodeSwap?: (sourceId: string, targetId: string) => void;
}

const nodeWidth = 172;
const nodeHeight = 36;

const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  dagreGraph.setGraph({ rankdir: 'LR' });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { 
      width: node.measured?.width ?? (node.style?.width as number) ?? nodeWidth, 
      height: node.measured?.height ?? (node.style?.height as number) ?? nodeHeight 
    });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
      position: {
        x: nodeWithPosition.x - (node.measured?.width ?? (node.style?.width as number) ?? nodeWidth) / 2,
        y: nodeWithPosition.y - (node.measured?.height ?? (node.style?.height as number) ?? nodeHeight) / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};

export function SessionGraph({ data, onNodeSwap }: SessionGraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const refreshLayout = useCallback(() => {
    if (!data) return;
    const initialNodes: Node[] = data.nodes.map((node) => {
      const isStartOrEnd = ['start', 'end'].includes(node.id.toLowerCase());
      const hasDetails = !!node.details;
      
      const width = isStartOrEnd ? 60 : nodeWidth;
      const height = isStartOrEnd ? 60 : (hasDetails ? 56 : 36);
      const borderRadius = isStartOrEnd ? '50%' : '8px';

      return {
        id: node.id,
        data: { 
          label: (
            <div title={node.details} style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              justifyContent: 'center', 
              height: '100%' 
            }}>
              <div style={{ fontWeight: 'bold', marginBottom: hasDetails ? '4px' : '0' }}>{node.label}</div>
              {node.details && (
                <div style={{ fontSize: '10px', opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {node.details}
                </div>
              )}
            </div>
          )
        },
        position: { x: 0, y: 0 },
        style: {
          background: getNodeColor(node.status),
          color: '#fff',
          border: '1px solid #23395B',
          borderRadius: borderRadius,
          padding: '10px',
          fontSize: '12px',
          width: width,
          height: height,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          textAlign: 'center',
        },
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
      style: { stroke: '#23395B' },
    }));

    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      initialNodes,
      initialEdges
    );

    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [data, setNodes, setEdges]);

  // Update layout when data changes
  useEffect(() => {
    refreshLayout();
  }, [refreshLayout]);

  const onNodeDragStop = useCallback((_: MouseEvent, node: Node) => {
    if (!onNodeSwap) {
        refreshLayout(); // Snap back
        return;
    }

    const overlapThreshold = 0;

    const getBox = (n: Node) => ({
      x: n.position.x,
      y: n.position.y,
      width: n.measured?.width ?? (n.style?.width as number) ?? nodeWidth,
      height: n.measured?.height ?? (n.style?.height as number) ?? nodeHeight,
    });

    const A = getBox(node);
    
    const targetNode = nodes.find((n) => {
      // Skip self
      if (n.id === node.id) return false;

      const B = getBox(n);

      const centerAX = A.x + A.width * 0.5;
      const centerAY = A.y + A.height * 0.5;
      const centerBX = B.x + B.width * 0.5;
      const centerBY = B.y + B.height * 0.5;

      const dx = centerAX - centerBX;
      const dy = centerAY - centerBY;

      const px = (A.width + B.width) * 0.5 - Math.abs(dx);
      const py = (A.height + B.height) * 0.5 - Math.abs(dy);
      
      const overlaps = px > overlapThreshold && py > overlapThreshold;

      return overlaps;
    });

    if (targetNode) {
      onNodeSwap(node.id, targetNode.id);
    }
    
    // Always snap back to layout positions (either current or new)
    // If the swap was valid, data will change eventually and trigger another refresh, which is fine.
    // If invalid, this snaps it back immediately.
    refreshLayout();

  }, [nodes, onNodeSwap, refreshLayout]);

  return (
    <div style={{ width: '100%', height: '100%', minHeight: '400px' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        fitView
      >
        <Background color="#ccc" gap={16} />
        <Controls />
      </ReactFlow>
    </div>
  );
}

function getNodeColor(status: string): string {
  switch (status?.toLowerCase()) {
    case 'succeeded':
      return '#16a34a'; // Green - Success
    case 'completed':
      return '#23395B'; // Dark Blue (Brand) - Success
    case 'running':
      return '#D81E5B'; // Pink (Brand) - Active
    case 'failed':
      return '#dc2626'; // Red - Failure
    case 'pending':
    default:
      return '#94a3b8'; // Gray - Waiting
  }
}

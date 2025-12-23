import { useEffect } from 'react';
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

export function SessionGraph({ data }: SessionGraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
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

  return (
    <div style={{ width: '100%', height: '100%', minHeight: '400px' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
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

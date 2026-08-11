import { Position } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import dagre from '@dagrejs/dagre';

/**
 * Dagre layout for the author canvas, kept UI-free so the serialization layer
 * (and its tests) can lay out a graph without pulling in React, CSS or the
 * browser globals that the canvas component needs.
 */

export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 100;

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

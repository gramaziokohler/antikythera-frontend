import { memo } from 'react';
import type { ReactNode } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Repeat, SkipForward, RefreshCw } from 'lucide-react';
import './ScopeGroupNode.css';

const policyIcons: Record<string, ReactNode> = {
  retry: <RefreshCw size={14} />,
  while: <Repeat size={14} />,
  skip: <SkipForward size={14} />,
};

const policyLabels: Record<string, string> = {
  retry: 'Retry',
  while: 'While',
  skip: 'Skip',
};

/**
 * The dashed frame drawn behind the tasks of a scope, in both the run monitor and
 * the authoring canvas.
 *
 * The frame itself is click-through (see the CSS) so it never steals a click meant
 * for the canvas or a task inside it; only the label chip is interactive. In the
 * editor that chip is how a scope is selected for editing — `onSelect` is passed
 * through node data rather than React Flow's own selection, which would make the
 * whole rectangle swallow pointer events.
 */
export const ScopeGroupNode = memo(({ data }: NodeProps) => {
  const { label, policyType, policySummary, selected, onSelect } = data as {
    label: string;
    policyType: string;
    policySummary?: string;
    selected?: boolean;
    onSelect?: () => void;
  };
  const icon = policyIcons[policyType] || policyIcons.skip;
  const badge = policyLabels[policyType] || 'Scope';

  return (
    <div className={`scope-group-node scope-${policyType}${selected ? ' selected' : ''}`}>
      <div
        className={`scope-label${onSelect ? ' clickable' : ''}`}
        onClick={onSelect}
        onMouseDown={(e) => e.stopPropagation()}
        role={onSelect ? 'button' : undefined}
        tabIndex={onSelect ? 0 : undefined}
        title={onSelect ? 'Edit this scope' : undefined}
      >
        <span className="scope-icon">{icon}</span>
        <span className="scope-badge">{badge}</span>
        <span className="scope-name">{label}</span>
        {policySummary && <span className="scope-summary">{policySummary}</span>}
      </div>
    </div>
  );
});

ScopeGroupNode.displayName = 'ScopeGroupNode';

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

export const ScopeGroupNode = memo(({ data }: NodeProps) => {
  const { label, policyType, policySummary } = data as any;
  const icon = policyIcons[policyType] || policyIcons.skip;
  const badge = policyLabels[policyType] || 'Scope';

  return (
    <div className={`scope-group-node scope-${policyType}`}>
      <div className="scope-label">
        <span className="scope-icon">{icon}</span>
        <span className="scope-badge">{badge}</span>
        <span className="scope-name">{label}</span>
        {policySummary && <span className="scope-summary">{policySummary}</span>}
      </div>
    </div>
  );
});

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { AuthorNodeData } from '../../types/blueprint-schema';
import './AuthorTaskNode.css';

function getVariant(taskType: string): 'atn-start' | 'atn-end' | 'atn-task' {
  if (taskType === 'system.start') return 'atn-start';
  if (taskType === 'system.end') return 'atn-end';
  return 'atn-task';
}

export const AuthorTaskNode = memo(({ id, data, selected }: NodeProps) => {
  const { taskType, description, inputs = [], outputs = [], params = [] } =
    data as AuthorNodeData;

  const variant = getVariant(taskType);
  const hasBadges = inputs.length > 0 || outputs.length > 0 || params.length > 0;

  return (
    <div className={`atn-root ${variant}${selected ? ' selected' : ''}`}>
      <Handle
        type="target"
        position={Position.Left}
        className="atn-handle"
        id="target"
      />

      <div className="atn-header">
        <div className="atn-id">{id}</div>
        <div className="atn-type">{taskType || '(no type)'}</div>
      </div>

      {description && <div className="atn-desc">{description}</div>}

      {hasBadges && (
        <div className="atn-badges">
          {inputs.length > 0 && (
            <span className="atn-badge inputs">{inputs.length} in</span>
          )}
          {outputs.length > 0 && (
            <span className="atn-badge outputs">{outputs.length} out</span>
          )}
          {params.length > 0 && (
            <span className="atn-badge params">{params.length} param</span>
          )}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        className="atn-handle"
        id="source"
      />
    </div>
  );
});

AuthorTaskNode.displayName = 'AuthorTaskNode';

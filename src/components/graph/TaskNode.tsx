import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { 
  Terminal, 
  Layers, 
  Image as ImageIcon, 
  FileText,
  CheckCircle2,
  XCircle,
  PlayCircle,
  Clock
} from 'lucide-react';
import './TaskNode.css';

// Map specific task types to icons
const getIconForType = (type: string) => {
  const normalized = type?.toLowerCase() || '';
  if (normalized.includes('image')) return <ImageIcon size={16} />;
  if (normalized.includes('document') || normalized.includes('text')) return <FileText size={16} />;
  if (normalized.includes('composite') || normalized.includes('blueprint')) return <Layers size={16} />;
  return <Terminal size={16} />;
};

const getStatusIcon = (status: string) => {
  const s = status?.toLowerCase();
  switch (s) {
    case 'succeeded':
    case 'completed':
      return <CheckCircle2 size={16} className="status-icon success" />;
    case 'failed':
      return <XCircle size={16} className="status-icon error" />;
    case 'running':
      return <PlayCircle size={16} className="status-icon running" />;
    case 'ready':
      return <PlayCircle size={16} className="status-icon ready" />;
    case 'skipped':
    case 'skip_requested':
      return <XCircle size={16} className="status-icon skipped" />;
    case 'pending':
    case 'unspecified':
    default:
      return <Clock size={16} className="status-icon pending" />;
  }
};

export const TaskNode = memo(({ data, selected }: NodeProps) => {
  const { label, status, type, description, details, inputs = [], outputs = [], condition, onExpand } = data as any;
  const isComposite = (type || '').toLowerCase().includes('composite');

  return (
      <div className={`task-node ${status?.toLowerCase()} ${selected ? 'selected' : ''}`}>
        <Handle type="target" position={Position.Left} className="task-handle input-handle" isConnectable={false} />
  
        <div className="node-header">
          <div className="node-icon-wrapper">
            {getIconForType(type)}
          </div>
          <div className="node-title-area">
            <div className="node-title">{data.id || label}</div>
            <div className="node-subtitle">{type || 'Task'}</div>
          </div>
          <div className="node-status-area">
              {getStatusIcon(status)}
          </div>
        </div>

        <div className="node-content">
            {description && <div className="node-description">{description}</div>}
            {condition && (
                <div className="node-condition">
                    <span className="condition-label">Condition:</span>
                    <span className="condition-value" title={condition}>{condition}</span>
                </div>
            )}
            
            {(inputs.length > 0 || outputs.length > 0) && (
                <div className="node-io-container">
                    {inputs.length > 0 && (
                        <div className="io-section inputs">
                            <span className="io-header">Inputs</span>
                            <div className="io-list">
                                {inputs.map((inp: any, i: number) => {
                                    // Handle COMPAS wrapper or direct data
                                    const inputData = inp.data || inp;
                                    if (inputData.get_from) {
                                        return (
                                            <div key={i} className="io-pill remapped">
                                                <span className="io-real">{inputData.get_from}</span>
                                                <span className="io-arrow">→</span>
                                                <span className="io-alias">{inputData.name}</span>
                                            </div>
                                        );
                                    }
                                    return (
                                        <div key={i} className="io-pill">
                                            {inputData.name}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    {outputs.length > 0 && (
                        <div className="io-section outputs">
                            <span className="io-header">Outputs</span>
                            <div className="io-list">
                                {outputs.map((out: any, i: number) => {
                                    // Handle COMPAS wrapper or direct data
                                    const outputData = out.data || out;
                                    if (outputData.set_to) {
                                        return (
                                            <div key={i} className="io-pill remapped">
                                                <span className="io-alias">{outputData.name}</span>
                                                <span className="io-arrow">→</span>
                                                <span className="io-real">{outputData.set_to}</span>
                                            </div>
                                        );
                                    }
                                    return (
                                        <div key={i} className="io-pill">
                                            {outputData.name}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>

        {details && (
           <div className="node-footer">
              <span className="node-details">{details}</span>
           </div>
        )}

        <Handle type="source" position={Position.Right} className="task-handle output-handle" isConnectable={false} />
        
        {isComposite && (
            <button 
                className="composite-expand-btn"
                onClick={(e) => {
                    e.stopPropagation();
                    onExpand?.(e, { data });
                }}
                title="Expand Blueprint"
            >
                <Layers size={12} />
                <span>Expand</span>
            </button>
        )}
    </div>
  );
});

import { useState } from 'react';
import { OctagonPause, Play } from 'lucide-react';
import type { SimulationAgent } from '../../agents/SimulationAgent';
import type { GraphNode } from '../../types';
import type { TaskOutput } from '../../types/blueprint-schema';
import { TypedValueEditor } from '../TypedValueEditor';
// TypedValueEditor renders with the `.tep-*` classes defined in author.css. The dashboard
// entry point (this component's home) never otherwise loads that stylesheet — only the
// authoring tool's own entry point does — so it's imported here too rather than duplicating the
// tier-1/2/3 editor styles a second time.
import '../../styles/author.css';
import './SimulationBreakpointPanel.css';

interface HeldTaskCardProps {
  agent: SimulationAgent;
  taskId: string;
  node: GraphNode | undefined;
}

/**
 * One held task: its declared outputs (from the running blueprint's own task definition — the
 * authoritative source per ADR-0003, not anything decoded off the wire), each editable with the
 * same type-driven editors TaskEditPanel uses to author them in the first place. Continue is
 * disabled until every declared output has a value, so a task held for want of one (no authored
 * default at all) reads as a prompt rather than a silent dead end.
 */
function HeldTaskCard({ agent, taskId, node }: HeldTaskCardProps) {
  const declaredOutputs = (node?.outputs ?? []) as TaskOutput[];
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {};
    for (const output of declaredOutputs) {
      if (output.value !== undefined) initial[output.name] = output.value;
    }
    return initial;
  });

  const requiresValue = agent.requiresValue(taskId);
  const missingValue = declaredOutputs.some((output) => values[output.name] === undefined);
  const canContinue = !missingValue;

  const updateOutput = (name: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <div className="sbp-card">
      <div className="sbp-card-header">
        <OctagonPause size={14} />
        <span className="sbp-task-id">{taskId}</span>
        {node?.type && <span className="sbp-task-type">{node.type}</span>}
      </div>

      {requiresValue && (
        <p className="sbp-hint">No authored output — supply a value for every output below to continue.</p>
      )}

      {declaredOutputs.length === 0 ? (
        <p className="sbp-hint">This task declares no outputs — nothing to supply.</p>
      ) : (
        <div className="sbp-outputs">
          {declaredOutputs.map((output) => (
            <div className="sbp-output-row" key={output.name}>
              <div className="sbp-output-label">
                <span className="sbp-output-name">{output.name}</span>
                <span className="sbp-output-type">{output.type ?? 'untyped'}</span>
              </div>
              <div className="sbp-output-value">
                <TypedValueEditor
                  type={output.type}
                  value={values[output.name]}
                  onChange={(value) => updateOutput(output.name, value)}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        className="sbp-continue-btn"
        disabled={!canContinue}
        onClick={() => agent.continueHeldTask(taskId, values)}
      >
        <Play size={13} />
        <span>Continue</span>
      </button>
    </div>
  );
}

interface SimulationBreakpointPanelProps {
  agent: SimulationAgent;
  heldTaskIds: string[];
  graphNodes: GraphNode[];
}

/** Session-monitor panel (issue-sim-06) listing every task the stand-in is currently holding on
 * the driving tab, letting the author inspect and edit each one's simulated output before
 * releasing it. Renders nothing when nothing is held. */
export function SimulationBreakpointPanel({ agent, heldTaskIds, graphNodes }: SimulationBreakpointPanelProps) {
  if (heldTaskIds.length === 0) return null;

  const nodesById = new Map(graphNodes.map((node) => [node.id, node]));

  return (
    <div className="sbp-root">
      <div className="sbp-header">
        <OctagonPause size={14} />
        <span>Held at breakpoint ({heldTaskIds.length})</span>
      </div>
      <div className="sbp-list">
        {heldTaskIds.map((taskId) => (
          <HeldTaskCard key={taskId} agent={agent} taskId={taskId} node={nodesById.get(taskId)} />
        ))}
      </div>
    </div>
  );
}

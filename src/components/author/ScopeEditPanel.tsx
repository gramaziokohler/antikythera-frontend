import { useRef } from 'react';
import { X, Ungroup, RefreshCw, Repeat, SkipForward, LogIn, LogOut } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ScopeStart } from '../../types/blueprint-schema';
import type { EditorScope, ScopePolicyType } from '../../utils/blueprint-scopes';
import { withPolicyType } from '../../utils/blueprint-scopes';

/**
 * Editor for one scope's looping policy.
 *
 * The three policies are mutually exclusive in the data model, so they are picked
 * from a segmented control rather than assembled field by field: choosing one
 * shows only the fields that policy actually reads, and no combination of inputs
 * can produce a scope_start carrying two policies at once.
 */

const POLICIES: { type: ScopePolicyType; label: string; icon: ReactNode; blurb: string }[] = [
  {
    type: 'skip',
    label: 'Skip',
    icon: <SkipForward size={13} />,
    blurb: 'Runs once. The whole region is skipped when the entry task’s condition is false.',
  },
  {
    type: 'retry',
    label: 'Retry',
    icon: <RefreshCw size={13} />,
    blurb: 'Re-runs the region a fixed number of times after the first pass.',
  },
  {
    type: 'while',
    label: 'While',
    icon: <Repeat size={13} />,
    blurb: 'Re-runs the region for as long as a condition holds after each pass.',
  },
];

interface ScopeEditPanelProps {
  scope: EditorScope;
  /** Condition on the entry task — what a skip-policy scope is gated on. */
  startCondition: string;
  onPolicyChange: (policy: ScopeStart) => void;
  onStartConditionChange: (condition: string) => void;
  onSelectTask: (taskId: string) => void;
  onUngroup: () => void;
  onClose: () => void;
}

export function ScopeEditPanel({
  scope,
  startCondition,
  onPolicyChange,
  onStartConditionChange,
  onSelectTask,
  onUngroup,
  onClose,
}: ScopeEditPanelProps) {
  const { policy, policyType } = scope;

  // Only one policy may exist in the blueprint, so switching type drops the other.
  // Hold on to what was dropped for as long as this scope is open, so a misclick
  // on the picker does not discard a hand-typed condition for good. Remounted per
  // scope (see the `key` in AuthorApp), so it never leaks across scopes.
  const discarded = useRef<Pick<ScopeStart, 'retry_policy' | 'while_policy'>>({});

  const switchPolicyType = (type: ScopePolicyType) => {
    if (policy.retry_policy) discarded.current.retry_policy = policy.retry_policy;
    if (policy.while_policy) discarded.current.while_policy = policy.while_policy;
    onPolicyChange(withPolicyType({ ...discarded.current, ...policy }, type));
  };

  /** Drops keys the author cleared, so an unset field leaves no trace in the JSON. */
  const compact = <T extends object>(value: T): T =>
    Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;

  const patchRetry = (patch: Partial<NonNullable<ScopeStart['retry_policy']>>) =>
    onPolicyChange({ ...policy, retry_policy: compact({ retries: 1, ...policy.retry_policy, ...patch }) });

  const patchWhile = (patch: Partial<NonNullable<ScopeStart['while_policy']>>) =>
    onPolicyChange({ ...policy, while_policy: compact({ condition: '', ...policy.while_policy, ...patch }) });

  const active = POLICIES.find((p) => p.type === policyType)!;

  return (
    <div className="tep-root">
      <div className="tep-header">
        <span className="tep-header-title">Edit Scope: {scope.label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            className="tep-close-btn"
            onClick={onUngroup}
            title="Ungroup — remove the scope, keep the tasks"
          >
            <Ungroup size={15} />
          </button>
          <button className="tep-close-btn" onClick={onClose} title="Close panel">
            <X size={15} />
          </button>
        </div>
      </div>

      <div className="tep-body">
        {/* ---- Identity ---- */}
        <div className="tep-section">
          <div className="tep-section-title">Identity</div>
          <div className="tep-field">
            <label className="tep-label">Name</label>
            <input
              className="tep-input"
              placeholder={scope.startId}
              value={policy.name ?? ''}
              onChange={(e) => {
                const next = { ...policy };
                if (e.target.value) next.name = e.target.value;
                else delete next.name;
                onPolicyChange(next);
              }}
            />
            <p className="tep-hint">Display only — the scope is identified by its entry task.</p>
          </div>
        </div>

        {/* ---- Policy ---- */}
        <div className="tep-section">
          <div className="tep-section-title">Policy</div>

          <div className="sep-policy-picker" role="radiogroup" aria-label="Scope policy">
            {POLICIES.map((option) => (
              <button
                key={option.type}
                role="radio"
                aria-checked={option.type === policyType}
                className={`sep-policy-option scope-${option.type}${option.type === policyType ? ' active' : ''}`}
                onClick={() => switchPolicyType(option.type)}
                title={option.blurb}
              >
                {option.icon}
                {option.label}
              </button>
            ))}
          </div>
          <p className="tep-hint">{active.blurb}</p>

          {policyType === 'skip' && (
            <div className="tep-field">
              <label className="tep-label">Entry condition</label>
              <input
                className="tep-input mono"
                placeholder="e.g. needs_review"
                value={startCondition}
                onChange={(e) => onStartConditionChange(e.target.value)}
              />
              <p className="tep-hint">
                Evaluated on <code>{scope.startId}</code> before the scope runs. Leave empty to
                always run the region once.
              </p>
            </div>
          )}

          {policyType === 'retry' && (
            <>
              <div className="tep-field">
                <label className="tep-label">Retries</label>
                <input
                  className="tep-input mono"
                  type="number"
                  min={0}
                  value={policy.retry_policy?.retries ?? 1}
                  onChange={(e) => patchRetry({ retries: Math.max(0, Number(e.target.value) || 0) })}
                />
                <p className="tep-hint">
                  Extra passes after the first one — {(policy.retry_policy?.retries ?? 1) + 1} runs
                  in total at most.
                </p>
              </div>
              <div className="tep-field">
                <label className="tep-label">Backoff between retries (ms)</label>
                <input
                  className="tep-input mono"
                  type="number"
                  min={0}
                  placeholder="none"
                  value={policy.retry_policy?.backoff?.constant_ms ?? ''}
                  onChange={(e) => {
                    const ms = e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0);
                    patchRetry({ backoff: ms === undefined ? undefined : { constant_ms: ms } });
                  }}
                />
                <p className="tep-hint">Experimental — recorded in the blueprint, not yet enforced.</p>
              </div>
            </>
          )}

          {policyType === 'while' && (
            <>
              <div className="tep-field">
                <label className="tep-label">Condition</label>
                <input
                  className="tep-input mono"
                  placeholder="e.g. not converged"
                  value={policy.while_policy?.condition ?? ''}
                  onChange={(e) => patchWhile({ condition: e.target.value })}
                />
                <p className="tep-hint">
                  Evaluated after each pass against session data. It may only read names that some
                  task in this blueprint declares as an output.
                </p>
              </div>
              <div className="tep-field">
                <label className="tep-label">Max iterations</label>
                <input
                  className="tep-input mono"
                  type="number"
                  min={1}
                  placeholder="unbounded"
                  value={policy.while_policy?.max_iterations ?? ''}
                  onChange={(e) => {
                    const max = e.target.value === '' ? undefined : Math.max(1, Number(e.target.value) || 1);
                    patchWhile({ max_iterations: max });
                  }}
                />
                <p className="tep-hint">
                  Total passes including the first. Without a cap, a condition that never turns
                  false loops forever.
                </p>
              </div>
            </>
          )}
        </div>

        {/* ---- Members ---- */}
        <div className="tep-section">
          <div className="tep-section-title">Tasks in scope ({scope.taskIds.length})</div>
          <div className="sep-member-list">
            {scope.taskIds.map((taskId) => (
              <button
                key={taskId}
                className="sep-member"
                onClick={() => onSelectTask(taskId)}
                title="Select this task"
              >
                <span className="sep-member-id">{taskId}</span>
                {taskId === scope.startId && (
                  <span className="sep-member-tag">
                    <LogIn size={10} /> entry
                  </span>
                )}
                {taskId === scope.endId && (
                  <span className="sep-member-tag">
                    <LogOut size={10} /> exit
                  </span>
                )}
              </button>
            ))}
          </div>
          <p className="tep-hint">
            Membership follows the graph: every task between the entry and exit tasks belongs to the
            scope. Rewire the tasks to change it.
          </p>
        </div>
      </div>
    </div>
  );
}

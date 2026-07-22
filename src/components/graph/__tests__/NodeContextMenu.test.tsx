import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ComponentProps } from 'react';
import { NodeContextMenu } from '../NodeContextMenu';

afterEach(() => cleanup());

function renderMenu(overrides: Partial<ComponentProps<typeof NodeContextMenu>> = {}) {
  const onToggleBreakpoint = vi.fn();
  render(
    <NodeContextMenu
      x={0}
      y={0}
      nodeId="task-1"
      nodeStatus="running"
      nodeType="simulation.demo.tool"
      scopeName={null}
      hasSession={true}
      onResetTask={vi.fn()}
      onSkipTask={vi.fn()}
      onResetScope={vi.fn()}
      onClose={vi.fn()}
      onToggleBreakpoint={onToggleBreakpoint}
      {...overrides}
    />,
  );
  return { onToggleBreakpoint };
}

describe('NodeContextMenu breakpoint toggle (issue-sim-06)', () => {
  it('does not show a breakpoint option on a watching tab (canBreakpoint false)', () => {
    renderMenu({ canBreakpoint: false });
    expect(screen.queryByText('Add breakpoint')).toBeNull();
    expect(screen.queryByText('Remove breakpoint')).toBeNull();
  });

  it('shows "Add breakpoint" and toggles it on click when driving', () => {
    const { onToggleBreakpoint } = renderMenu({ canBreakpoint: true, isBreakpointed: false });

    const btn = screen.getByText('Add breakpoint');
    fireEvent.click(btn);

    expect(onToggleBreakpoint).toHaveBeenCalledWith('task-1');
  });

  it('shows "Remove breakpoint" when the task is already breakpointed', () => {
    renderMenu({ canBreakpoint: true, isBreakpointed: true });
    expect(screen.getByText('Remove breakpoint')).toBeTruthy();
  });

  it('disables the toggle and explains why when break-on-every-task is on', () => {
    renderMenu({ canBreakpoint: true, breakOnEveryTask: true });

    const button = screen.getByText(/breakpoint/).closest('button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText(/Stepping is on/)).toBeTruthy();
  });
});

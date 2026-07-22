import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useSimulationAgentState } from '../useSimulationAgentState';
import { SimulationAgent } from '../../agents/SimulationAgent';
import { Task } from '../../agents/Task';

describe('useSimulationAgentState', () => {
  it('returns a stable empty snapshot when agent is null', () => {
    const { result, rerender } = renderHook(() => useSimulationAgentState(null));

    expect(result.current).toEqual({ breakpoints: new Set(), breakOnEveryTask: false, heldTaskIds: [] });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('reflects breakpoint toggles on the agent', () => {
    const agent = new SimulationAgent();
    const { result } = renderHook(() => useSimulationAgentState(agent));

    expect(result.current.breakpoints.size).toBe(0);

    act(() => {
      agent.toggleBreakpoint('task-1');
    });

    expect(result.current.breakpoints.has('task-1')).toBe(true);
  });

  it('reflects break-on-every-task and held task ids', () => {
    const agent = new SimulationAgent();
    const { result } = renderHook(() => useSimulationAgentState(agent));

    act(() => {
      agent.setBreakOnEveryTask(true);
    });
    expect(result.current.breakOnEveryTask).toBe(true);

    const task = new Task({ id: 'task-1', type: 'simulation.demo.tool', params: {} });

    act(() => {
      // No awaits in invokeTool's body before the hold is registered, so this runs
      // synchronously within the act() callback.
      agent.invokeTool!('demo.tool', task);
    });

    expect(result.current.heldTaskIds).toEqual(['task-1']);
  });
});

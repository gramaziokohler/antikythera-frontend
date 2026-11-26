import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useSimulationActorState } from '../useSimulationActorState';
import { SimulationActor } from '../../actors/SimulationActor';
import { Task } from "@gramaziokohler/antikythera-ts/actors";
import { TaskAssignmentMessage } from '@gramaziokohler/antikythera-ts';

describe('useSimulationActorState', () => {
  it('returns a stable empty snapshot when actor is null', () => {
    const { result, rerender } = renderHook(() => useSimulationActorState(null));

    expect(result.current).toEqual({ breakpoints: new Set(), breakOnEveryTask: false, heldTaskIds: [], delayMs: 0 });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('reflects breakpoint toggles on the actor', () => {
    const actor = new SimulationActor();
    const { result } = renderHook(() => useSimulationActorState(actor));

    expect(result.current.breakpoints.size).toBe(0);

    act(() => {
      actor.toggleBreakpoint('task-1');
    });

    expect(result.current.breakpoints.has('task-1')).toBe(true);
  });

  it('reflects break-on-every-task and held task ids', () => {
    const actor = new SimulationActor();
    const { result } = renderHook(() => useSimulationActorState(actor));

    act(() => {
      actor.setBreakOnEveryTask(true);
    });
    expect(result.current.breakOnEveryTask).toBe(true);

    const task = new Task(new TaskAssignmentMessage({ id: 'task-1', type: 'simulation.demo.tool', params: {} }));

    act(() => {
      // No awaits in invokeTool's body before the hold is registered, so this runs
      // synchronously within the act() callback.
      actor.invokeTool!('demo.tool', task);
    });

    expect(result.current.heldTaskIds).toEqual(['task-1']);
  });
});

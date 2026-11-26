import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSimulationStandIn } from '../useSimulationStandIn';
import { markDrivingSimulationSession } from '../../utils/simulation-session';

const registerActor = vi.fn();
const unregisterActor = vi.fn();

vi.mock('@gramaziokohler/antikythera-ts/actors', () => ({
  MqttService: { getInstance: vi.fn(() => ({})) },
  ActorLauncher: {
    getInstance: vi.fn(() => ({ registerActor, unregisterActor })),
  },
}));

vi.mock('../../actors/SimulationActor', () => ({
  SimulationActor: class {
    type = 'simulation';
    blueprintId?: string;
    constructor(blueprintId?: string) {
      this.blueprintId = blueprintId;
    }
  },
}));

beforeEach(() => {
  sessionStorage.clear();
  registerActor.mockClear();
  unregisterActor.mockClear();
});

describe('useSimulationStandIn', () => {
  it('registers the stand-in when this tab is marked as driving the session', () => {
    markDrivingSimulationSession('sess-1', 'bp-1__sim');
    renderHook(() => useSimulationStandIn('sess-1'));

    expect(registerActor).toHaveBeenCalledTimes(1);
  });

  it('registers nothing in a second tab/session not marked as driving', () => {
    markDrivingSimulationSession('sess-other', 'bp-other__sim');
    renderHook(() => useSimulationStandIn('sess-1'));

    expect(registerActor).not.toHaveBeenCalled();
  });

  it('registers nothing when there is no active session id', () => {
    renderHook(() => useSimulationStandIn(null));

    expect(registerActor).not.toHaveBeenCalled();
  });

  it('unregisters the stand-in on unmount', () => {
    markDrivingSimulationSession('sess-1', 'bp-1__sim');
    const { unmount } = renderHook(() => useSimulationStandIn('sess-1'));

    unmount();

    expect(unregisterActor).toHaveBeenCalledWith('simulation');
  });

  it('returns the registered stand-in instance on the driving tab (issue-sim-06: needed to toggle breakpoints)', () => {
    markDrivingSimulationSession('sess-1', 'bp-1__sim');
    const { result } = renderHook(() => useSimulationStandIn('sess-1'));

    expect(result.current).not.toBeNull();
    expect(result.current?.type).toBe('simulation');
  });

  it('returns null on a watching tab', () => {
    markDrivingSimulationSession('sess-other', 'bp-other__sim');
    const { result } = renderHook(() => useSimulationStandIn('sess-1'));

    expect(result.current).toBeNull();
  });
});

import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSimulationStandIn } from '../useSimulationStandIn';
import { markDrivingSimulationSession } from '../../utils/simulation-session';

const registerAgent = vi.fn();
const unregisterAgent = vi.fn();

vi.mock('../../services/MqttService', () => ({
  MqttService: { getInstance: vi.fn(() => ({})) },
}));

vi.mock('../../agents/AgentLauncher', () => ({
  AgentLauncher: {
    getInstance: vi.fn(() => ({ registerAgent, unregisterAgent })),
  },
}));

vi.mock('../../agents/SimulationAgent', () => ({
  SimulationAgent: class {
    type = 'simulation';
  },
}));

beforeEach(() => {
  sessionStorage.clear();
  registerAgent.mockClear();
  unregisterAgent.mockClear();
});

describe('useSimulationStandIn', () => {
  it('registers the stand-in when this tab is marked as driving the session', () => {
    markDrivingSimulationSession('sess-1');
    renderHook(() => useSimulationStandIn('sess-1'));

    expect(registerAgent).toHaveBeenCalledTimes(1);
  });

  it('registers nothing in a second tab/session not marked as driving', () => {
    markDrivingSimulationSession('sess-other');
    renderHook(() => useSimulationStandIn('sess-1'));

    expect(registerAgent).not.toHaveBeenCalled();
  });

  it('registers nothing when there is no active session id', () => {
    renderHook(() => useSimulationStandIn(null));

    expect(registerAgent).not.toHaveBeenCalled();
  });

  it('unregisters the stand-in on unmount', () => {
    markDrivingSimulationSession('sess-1');
    const { unmount } = renderHook(() => useSimulationStandIn('sess-1'));

    unmount();

    expect(unregisterAgent).toHaveBeenCalledWith('simulation');
  });
});

import { useSyncExternalStore } from 'react';
import type { SimulationAgent, SimulationAgentSnapshot } from '../agents/SimulationAgent';
import { EMPTY_SIMULATION_SNAPSHOT } from '../agents/SimulationAgent';

const noopSubscribe = () => () => {};

/**
 * Reactively reads breakpoint/hold state off `agent` (see SimulationAgent.ts). `agent` is `null`
 * on a watching tab or a non-simulation session, in which case this returns a stable empty
 * snapshot and subscribes to nothing.
 */
export function useSimulationAgentState(agent: SimulationAgent | null): SimulationAgentSnapshot {
  return useSyncExternalStore(
    agent ? (onStoreChange) => agent.subscribe(onStoreChange) : noopSubscribe,
    agent ? () => agent.getSnapshot() : () => EMPTY_SIMULATION_SNAPSHOT,
  );
}

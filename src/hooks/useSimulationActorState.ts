import { useSyncExternalStore } from 'react';
import type { SimulationActor, SimulationActorSnapshot } from '../actors/SimulationActor';
import { EMPTY_SIMULATION_SNAPSHOT } from '../actors/SimulationActor';

const noopSubscribe = () => () => {};

/**
 * Reactively reads breakpoint/hold state off `actor` (see SimulationActor.ts). `actor` is `null`
 * on a watching tab or a non-simulation session, in which case this returns a stable empty
 * snapshot and subscribes to nothing.
 */
export function useSimulationActorState(actor: SimulationActor | null): SimulationActorSnapshot {
  return useSyncExternalStore(
    actor ? (onStoreChange) => actor.subscribe(onStoreChange) : noopSubscribe,
    actor ? () => actor.getSnapshot() : () => EMPTY_SIMULATION_SNAPSHOT,
  );
}

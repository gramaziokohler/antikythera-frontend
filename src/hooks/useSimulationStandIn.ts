import { useEffect, useMemo } from 'react';
import { MqttService } from "@gramaziokohler/antikythera-ts/actors";
import { ActorLauncher } from "@gramaziokohler/antikythera-ts/actors";
import { SimulationActor } from '../actors/SimulationActor';
import { getDrivingSimulationBlueprintId } from '../utils/simulation-session';

/**
 * Registers the ADR-0003 stand-in actor for `sessionId`, but only in the tab that pressed
 * Simulate for it (per the sessionStorage marker written by blueprint-simulate's caller). A
 * second tab viewing the same session registers nothing and only renders the graph.
 *
 * Returns the registered `SimulationActor` instance so the driving tab can toggle breakpoints
 * and release held tasks (see issue-sim-06); returns `null` on a watching tab or when there is
 * no session. The instance itself is created with `useMemo` (a plain, side-effect-free
 * constructor call) so it's available to render immediately; the actual registration with
 * `ActorLauncher` — the part that talks to an external system — stays in its own effect, with no
 * `setState` call, so as not to trip `react-hooks/set-state-in-effect`.
 */
export function useSimulationStandIn(sessionId: string | null | undefined): SimulationActor | null {
  const actor = useMemo(() => {
    const blueprintId = sessionId ? getDrivingSimulationBlueprintId(sessionId) : null;
    return blueprintId ? new SimulationActor(blueprintId) : null;
  }, [sessionId]);

  useEffect(() => {
    if (!actor) return;

    const mqttService = MqttService.getInstance();
    const actorLauncher = ActorLauncher.getInstance(mqttService);
    actorLauncher.registerActor(actor);

    return () => {
      actorLauncher.unregisterActor(actor.type);
    };
  }, [actor]);

  return actor;
}

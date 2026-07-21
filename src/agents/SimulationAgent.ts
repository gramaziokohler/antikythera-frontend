import type { Agent } from './Agent';
import { Task } from './Task';
import { SIMULATED_OUTPUT_PARAM_PREFIX } from '../utils/blueprint-simulate';
import { passthroughAnyData } from './anyDataCodec';

/** ADR-0003: the stand-in agent type. Claims `simulation.*` tasks and nothing else. */
export const SIMULATION_AGENT_TYPE = 'simulation';

/**
 * The stand-in agent for ADR-0003 simulation mode. Registered as agent type `simulation`,
 * it claims every `simulation.*` task (via canHandleTool, since it implements no per-tool
 * methods) and completes each one with the simulated outputs carried in its params under the
 * `__sim_out__` prefix (see blueprint-simulate.ts).
 *
 * Simulated output params are forwarded byte-for-byte (see anyDataCodec.ts's
 * AnyDataPassthrough) rather than decoded and re-encoded — a param can arrive already
 * reconstructed into a real COMPAS object's native wire shape (the *uploaded blueprint file* is
 * itself parsed with compas.data's own JSON decoder, which reconstructs any `{dtype, data}` it
 * finds before the session ever starts), and per ADR-0003 the stand-in must not construct a
 * COMPAS object anyway, so it has no business decoding one either.
 *
 * A task with no simulated outputs is claimed and then held indefinitely rather than
 * completed empty, per ADR-0003 — the invokeTool promise simply never resolves. Releasing a
 * held task is issue-sim-06 (breakpoints); this agent only implements the hold.
 */
export class SimulationAgent implements Agent {
    type = SIMULATION_AGENT_TYPE;

    canHandleTool(): boolean {
        return true;
    }

    async invokeTool(_toolName: string, task: Task): Promise<unknown> {
        const rawParams = task.getRawParams();
        const outputs: Record<string, unknown> = {};
        let hasSimulatedOutput = false;

        for (const [key, anyData] of Object.entries(rawParams)) {
            if (key.startsWith(SIMULATED_OUTPUT_PARAM_PREFIX)) {
                outputs[key.substring(SIMULATED_OUTPUT_PARAM_PREFIX.length)] = passthroughAnyData(anyData);
                hasSimulatedOutput = true;
            }
        }

        if (hasSimulatedOutput) {
            return outputs;
        }

        // No authored output: hold rather than complete empty. Never resolves/rejects.
        return new Promise<unknown>(() => {});
    }
}

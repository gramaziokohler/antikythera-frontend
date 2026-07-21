import type { Agent } from './Agent';
import { Task } from './Task';
import { SIMULATED_OUTPUT_PARAM_PREFIX } from '../utils/blueprint-simulate';

/** ADR-0003: the stand-in agent type. Claims `simulation.*` tasks and nothing else. */
export const SIMULATION_AGENT_TYPE = 'simulation';

/**
 * The stand-in agent for ADR-0003 simulation mode. Registered as agent type `simulation`,
 * it claims every `simulation.*` task (via canHandleTool, since it implements no per-tool
 * methods) and completes each one with the simulated outputs carried in its params under the
 * `__sim_out__` prefix (see blueprint-simulate.ts).
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
        const params = task.params ?? {};
        const outputs: Record<string, unknown> = {};
        let hasSimulatedOutput = false;

        for (const [key, value] of Object.entries(params)) {
            if (key.startsWith(SIMULATED_OUTPUT_PARAM_PREFIX)) {
                outputs[key.substring(SIMULATED_OUTPUT_PARAM_PREFIX.length)] = value;
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

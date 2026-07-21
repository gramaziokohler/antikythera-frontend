import { describe, it, expect } from 'vitest';
import { SimulationAgent, SIMULATION_AGENT_TYPE } from '../SimulationAgent';
import { simulatedOutputParamName } from '../../utils/blueprint-simulate';
import type { Agent } from '../Agent';
import { Task } from '../Task';
import { antikythera, compas_pb } from '../../proto/bundle';

function taskWithParams(params: Record<string, { stringValue?: string; numberValue?: number; boolValue?: boolean }>) {
  const encoded: { [k: string]: compas_pb.data.IAnyData } = {};
  for (const [key, value] of Object.entries(params)) {
    encoded[key] = { value };
  }
  const message: antikythera.v1.ITaskAssignmentMessage = {
    id: 'task-1',
    type: 'simulation.compas_fab.plan_trajectory',
    params: encoded,
  };
  return new Task(message);
}

describe('SimulationAgent', () => {
  it('has agent type "simulation"', () => {
    expect(new SimulationAgent().type).toBe(SIMULATION_AGENT_TYPE);
  });

  it('canHandleTool claims any tool name', () => {
    const agent: Agent = new SimulationAgent();
    expect(agent.canHandleTool?.('compas_fab.plan_trajectory')).toBe(true);
    expect(agent.canHandleTool?.('anything.at.all')).toBe(true);
  });

  it('completes with simulated outputs found under the __sim_out__ prefix, keyed by output name', async () => {
    const agent = new SimulationAgent();
    const task = taskWithParams({
      speed: { numberValue: 1.5 },
      [simulatedOutputParamName('trajectory')]: { stringValue: 'ok' },
    });

    const result = await agent.invokeTool!('compas_fab.plan_trajectory', task);

    expect(result).toEqual({ trajectory: 'ok' });
  });

  it('holds (never resolves) when no simulated output param is present', async () => {
    const agent = new SimulationAgent();
    const task = taskWithParams({ speed: { numberValue: 1.5 } });

    let settled = false;
    agent.invokeTool!('compas_fab.plan_trajectory', task).then(() => {
      settled = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(settled).toBe(false);
  });
});

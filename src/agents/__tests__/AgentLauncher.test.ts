import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { AgentLauncher } from '../AgentLauncher';
import type { Agent } from '../Agent';
import type { MqttService } from '../../services/MqttService';
import { passthroughAnyData } from '../compasPb';
import { antikythera, compas_pb } from '../../proto/bundle';

/** Decodes a published completion-message buffer back to its outputs map, mirroring
 * AgentLauncher's own wrapMessage (MessageData -> AnyData -> Any -> TaskCompletionMessage). */
function decodeCompletionOutputs(buffer: Buffer): { [k: string]: compas_pb.data.IAnyData } {
  const msgData = compas_pb.data.MessageData.decode(new Uint8Array(buffer));
  const anyMsg = msgData.data!.message!;
  const completion = antikythera.v1.TaskCompletionMessage.decode(anyMsg.value as Uint8Array);
  return completion.outputs ?? {};
}

// The private surface of AgentLauncher this suite needs to reach directly, since
// findAgentForTaskType/executeTask aren't part of its public API.
type PrivateLauncher = {
  findAgentForTaskType(taskType: string): { agent: Agent | null; toolName: string | null };
  executeTask(task: { id: string; type: string }): Promise<void>;
};

function asPrivate(launcher: AgentLauncher): PrivateLauncher {
  return launcher as unknown as PrivateLauncher;
}

function fakeMqttService(): MqttService {
  return {
    onMessage: vi.fn(() => () => {}),
    subscribe: vi.fn(async () => {}),
    publish: vi.fn(),
  } as unknown as MqttService;
}

// AgentLauncher is a private singleton; reset it between tests so each test gets its own
// agent registry and fake MqttService instead of leaking across cases.
function resetSingleton() {
  (AgentLauncher as unknown as { instance: unknown }).instance = undefined;
}

describe('AgentLauncher generic tool matching (ADR-0003)', () => {
  beforeEach(() => {
    resetSingleton();
  });

  it('claims a task via canHandleTool when the agent has no method named after the tool', () => {
    const launcher = AgentLauncher.getInstance(fakeMqttService());
    const agent: Agent = {
      type: 'simulation',
      canHandleTool: () => true,
    };
    launcher.registerAgent(agent);

    const found = asPrivate(launcher).findAgentForTaskType('simulation.compas_fab.plan_trajectory');
    expect(found.agent).toBe(agent);
    expect(found.toolName).toBe('compas_fab.plan_trajectory');
  });

  it('does not claim a task outside its prefix even though canHandleTool always returns true', () => {
    const launcher = AgentLauncher.getInstance(fakeMqttService());
    const agent: Agent = {
      type: 'simulation',
      canHandleTool: () => true,
    };
    launcher.registerAgent(agent);

    const found = asPrivate(launcher).findAgentForTaskType('user_prompt.confirm');
    expect(found.agent).toBeNull();
  });

  it('falls back to method-existence check when canHandleTool is not implemented (existing agents unaffected)', () => {
    const launcher = AgentLauncher.getInstance(fakeMqttService());
    const agent: Agent = {
      type: 'user_prompt',
      confirm: async () => ({}),
    };
    launcher.registerAgent(agent);

    expect(asPrivate(launcher).findAgentForTaskType('user_prompt.confirm').toolName).toBe('confirm');
    expect(asPrivate(launcher).findAgentForTaskType('user_prompt.unknown_tool').agent).toBeNull();
  });

  it('dispatches through invokeTool when no method named after the tool exists on the agent', async () => {
    const launcher = AgentLauncher.getInstance(fakeMqttService());
    const invokeTool: Mock<(toolName: string, task: unknown) => Promise<{ done: boolean }>> = vi.fn(
      async () => ({ done: true }),
    );
    const agent: Agent = {
      type: 'simulation',
      canHandleTool: () => true,
      invokeTool,
    };
    launcher.registerAgent(agent);

    await asPrivate(launcher).executeTask({ id: 't1', type: 'simulation.foo.bar' });

    expect(invokeTool).toHaveBeenCalledTimes(1);
    expect(invokeTool.mock.calls[0][0]).toBe('foo.bar');
  });

  it('still calls the per-tool method directly when one exists, without going through invokeTool', async () => {
    const launcher = AgentLauncher.getInstance(fakeMqttService());
    const invokeTool = vi.fn();
    const confirm = vi.fn(async () => ({ result: 'OK' }));
    const agent: Agent = {
      type: 'user_prompt',
      confirm,
      invokeTool,
    };
    launcher.registerAgent(agent);

    await asPrivate(launcher).executeTask({ id: 't2', type: 'user_prompt.confirm' });

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(invokeTool).not.toHaveBeenCalled();
  });
});

describe('AgentLauncher completion output encoding (issue-sim-04)', () => {
  beforeEach(() => {
    resetSingleton();
  });

  it('forwards a passthrough output byte-for-byte instead of re-encoding it', async () => {
    const mqtt = fakeMqttService();
    const launcher = AgentLauncher.getInstance(mqtt);
    const rawFrame: compas_pb.data.IAnyData = {
      message: {
        type_url: 'type.googleapis.com/compas_pb.data.FrameData',
        value: new Uint8Array([9, 8, 7]),
      },
    };
    const agent: Agent = {
      type: 'simulation',
      canHandleTool: () => true,
      invokeTool: async () => ({ frame: passthroughAnyData(rawFrame) }),
    };
    launcher.registerAgent(agent);

    await (launcher as unknown as { executeTask(task: { id: string; type: string }): Promise<void> }).executeTask({
      id: 't3',
      type: 'simulation.demo.make_frame',
    });

    const publishMock = mqtt.publish as unknown as Mock;
    const completedCall = publishMock.mock.calls.find(([topic]) => topic === 'antikythera/task/completed')!;
    const outputs = decodeCompletionOutputs(completedCall[1] as Buffer);

    expect(outputs.frame).toEqual(rawFrame);
  });

  it('still encodes a plain JS output value via encodeAnyData when not a passthrough', async () => {
    const mqtt = fakeMqttService();
    const launcher = AgentLauncher.getInstance(mqtt);
    const agent: Agent = {
      type: 'simulation',
      canHandleTool: () => true,
      invokeTool: async () => ({ trajectory: 'ok' }),
    };
    launcher.registerAgent(agent);

    await (launcher as unknown as { executeTask(task: { id: string; type: string }): Promise<void> }).executeTask({
      id: 't4',
      type: 'simulation.demo.plan',
    });

    const publishMock = mqtt.publish as unknown as Mock;
    const completedCall = publishMock.mock.calls.find(([topic]) => topic === 'antikythera/task/completed')!;
    const outputs = decodeCompletionOutputs(completedCall[1] as Buffer);

    expect(outputs.trajectory).toEqual({ value: { stringValue: 'ok' } });
  });
});

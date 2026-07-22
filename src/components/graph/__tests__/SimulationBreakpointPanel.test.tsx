import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { SimulationBreakpointPanel } from '../SimulationBreakpointPanel';
import { SimulationAgent } from '../../../agents/SimulationAgent';
import { Task } from '../../../agents/Task';
import { transformBlueprintToGraph } from '../../../utils/transform-blueprint';
import type { GraphNode } from '../../../types';

afterEach(() => cleanup());

function nodeWithOutputs(id: string, outputs: GraphNode['outputs']): GraphNode {
  return { id, label: id, status: 'running', type: 'simulation.demo.tool', outputs };
}

/**
 * One task as the *session* API serves it: COMPAS `json_dumps` wraps every Data object in
 * `{dtype, guid, data}`, so a task's declared outputs arrive nested under `data` rather than
 * flat like the authoring tool's own blueprints.
 */
function compasTask(id: string, outputs: { name: string; type: string; value?: unknown }[]) {
  return {
    dtype: 'antikythera.models/Task',
    guid: `guid-${id}`,
    data: {
      id,
      type: 'simulation.demo.tool',
      state: 'RUNNING',
      inputs: [],
      params: [],
      depends_on: [],
      outputs: outputs.map((o) => ({
        dtype: 'antikythera.models/TaskOutput',
        guid: `guid-${id}-${o.name}`,
        name: o.name,
        data: { name: o.name, type: o.type, value: o.value ?? null, description: null, set_to: null },
      })),
    },
  };
}

describe('SimulationBreakpointPanel', () => {
  it('renders nothing when no task is held', () => {
    const agent = new SimulationAgent();
    const { container } = render(
      <SimulationBreakpointPanel agent={agent} heldTaskIds={[]} graphNodes={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows the held task with an editor seeded from its authored default and continues with the edit', async () => {
    const agent = new SimulationAgent();
    agent.toggleBreakpoint('task-1');
    const task = new Task({
      id: 'task-1',
      type: 'simulation.demo.tool',
      params: { __sim_out__label: { value: { stringValue: 'authored-default' } } },
    });
    const pending = agent.invokeTool!('demo.tool', task);

    const node = nodeWithOutputs('task-1', [{ name: 'label', type: 'str', value: 'authored-default' }]);
    render(<SimulationBreakpointPanel agent={agent} heldTaskIds={['task-1']} graphNodes={[node]} />);

    expect(screen.getByText('task-1')).toBeTruthy();
    const input = screen.getByDisplayValue('authored-default');
    fireEvent.change(input, { target: { value: 'edited-value' } });

    fireEvent.click(screen.getByText('Continue'));

    expect(await pending).toEqual({ label: 'edited-value' });
  });

  it('disables Continue until every declared output has a value, for a task with no authored default', () => {
    const agent = new SimulationAgent();
    const task = new Task({ id: 'task-2', type: 'simulation.demo.tool', params: {}, outputKeys: ['label'] });
    agent.invokeTool!('demo.tool', task);

    const node = nodeWithOutputs('task-2', [{ name: 'label', type: 'str' }]);
    render(<SimulationBreakpointPanel agent={agent} heldTaskIds={['task-2']} graphNodes={[node]} />);

    expect(screen.getByText(/No authored output/)).toBeTruthy();
    const continueBtn = screen.getByText('Continue').closest('button') as HTMLButtonElement;
    expect(continueBtn.disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText('value'), { target: { value: 'now supplied' } });

    expect(continueBtn.disabled).toBe(false);
  });

  it('seeds and continues a task held on a graph built from a live session blueprint', async () => {
    const agent = new SimulationAgent();
    agent.toggleBreakpoint('task-1');
    const task = new Task({
      id: 'task-1',
      type: 'simulation.demo.tool',
      params: { __sim_out__label: { value: { stringValue: 'authored-default' } } },
    });
    const pending = agent.invokeTool!('demo.tool', task);

    const graph = transformBlueprintToGraph({
      dtype: 'antikythera.models/Blueprint',
      data: { id: 'demo__sim', tasks: [compasTask('task-1', [{ name: 'label', type: 'str', value: 'authored-default' }])] },
    });
    render(<SimulationBreakpointPanel agent={agent} heldTaskIds={['task-1']} graphNodes={graph.nodes} />);

    // The declared type drives the editor, and the authored default seeds it, so Continue is
    // live the moment the task is held — nothing to re-type by hand.
    expect(screen.getByText('str')).toBeTruthy();
    const continueBtn = screen.getByText('Continue').closest('button') as HTMLButtonElement;
    expect(continueBtn.disabled).toBe(false);

    fireEvent.change(screen.getByDisplayValue('authored-default'), { target: { value: 'edited-value' } });
    fireEvent.click(continueBtn);

    expect(await pending).toEqual({ label: 'edited-value' });
  });

  it('continues a breakpointed task that declares no outputs', async () => {
    const agent = new SimulationAgent();
    agent.toggleBreakpoint('task-3');
    const task = new Task({ id: 'task-3', type: 'simulation.demo.tool', params: {}, outputKeys: [] });
    const pending = agent.invokeTool!('demo.tool', task);

    render(
      <SimulationBreakpointPanel
        agent={agent}
        heldTaskIds={['task-3']}
        graphNodes={[nodeWithOutputs('task-3', [])]}
      />,
    );

    expect(screen.getByText(/declares no outputs/)).toBeTruthy();
    // Continue is offered, so it has to work: an enabled button the agent then refuses would
    // strand the task with no way to release it but a manual Reset.
    fireEvent.click(screen.getByText('Continue'));

    expect(await pending).toEqual({});
  });

  it('lists multiple held tasks independently', () => {
    const agent = new SimulationAgent();
    const nodes = [nodeWithOutputs('task-a', []), nodeWithOutputs('task-b', [])];
    render(<SimulationBreakpointPanel agent={agent} heldTaskIds={['task-a', 'task-b']} graphNodes={nodes} />);

    expect(screen.getByText('task-a')).toBeTruthy();
    expect(screen.getByText('task-b')).toBeTruthy();
    expect(screen.getByText('Held at breakpoint (2)')).toBeTruthy();
  });
});

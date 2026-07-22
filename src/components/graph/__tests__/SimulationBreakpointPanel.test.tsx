import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { SimulationBreakpointPanel } from '../SimulationBreakpointPanel';
import { SimulationAgent } from '../../../agents/SimulationAgent';
import { Task } from '../../../agents/Task';
import type { GraphNode } from '../../../types';

afterEach(() => cleanup());

function nodeWithOutputs(id: string, outputs: GraphNode['outputs']): GraphNode {
  return { id, label: id, status: 'running', type: 'simulation.demo.tool', outputs };
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
    const task = new Task({ id: 'task-2', type: 'simulation.demo.tool', params: {} });
    agent.invokeTool!('demo.tool', task);

    const node = nodeWithOutputs('task-2', [{ name: 'label', type: 'str' }]);
    render(<SimulationBreakpointPanel agent={agent} heldTaskIds={['task-2']} graphNodes={[node]} />);

    expect(screen.getByText(/No authored output/)).toBeTruthy();
    const continueBtn = screen.getByText('Continue').closest('button') as HTMLButtonElement;
    expect(continueBtn.disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText('value'), { target: { value: 'now supplied' } });

    expect(continueBtn.disabled).toBe(false);
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

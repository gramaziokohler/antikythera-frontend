import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { TaskEditPanel } from '../TaskEditPanel';
import type { AuthorNodeData } from '../../../types/blueprint-schema';

afterEach(() => cleanup());

function baseData(overrides: Partial<AuthorNodeData> = {}): AuthorNodeData {
  return {
    taskType: 'compas_fab.plan_trajectory',
    description: '',
    condition: '',
    inputs: [],
    outputs: [],
    params: [],
    ...overrides,
  };
}

function renderPanel(data: AuthorNodeData, onUpdate = vi.fn()) {
  render(
    <TaskEditPanel
      nodeId="plan"
      data={data}
      onUpdate={onUpdate}
      onDelete={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  return onUpdate;
}

describe('TaskEditPanel tier-1 output value editors (ADR-0003)', () => {
  it('renders a text input for a str output and reports the typed value', () => {
    const onUpdate = renderPanel(
      baseData({ outputs: [{ name: 'label', type: 'str' }] }),
    );

    fireEvent.change(screen.getByPlaceholderText('value'), { target: { value: 'hello' } });

    const [, , updatedData] = onUpdate.mock.calls.at(-1)!;
    expect(updatedData.outputs).toEqual([{ name: 'label', type: 'str', value: 'hello' }]);
  });

  it('renders a number input for an int output and parses an integer', () => {
    const onUpdate = renderPanel(
      baseData({ outputs: [{ name: 'count', type: 'int' }] }),
    );

    const input = screen.getByPlaceholderText('value') as HTMLInputElement;
    expect(input.type).toBe('number');
    fireEvent.change(input, { target: { value: '42' } });

    const [, , updatedData] = onUpdate.mock.calls.at(-1)!;
    expect(updatedData.outputs).toEqual([{ name: 'count', type: 'int', value: 42 }]);
  });

  it('renders a number input for a float output and parses a float', () => {
    const onUpdate = renderPanel(
      baseData({ outputs: [{ name: 'speed', type: 'float' }] }),
    );

    fireEvent.change(screen.getByPlaceholderText('value'), { target: { value: '1.5' } });

    const [, , updatedData] = onUpdate.mock.calls.at(-1)!;
    expect(updatedData.outputs).toEqual([{ name: 'speed', type: 'float', value: 1.5 }]);
  });

  it('renders a checkbox for a bool output', () => {
    const onUpdate = renderPanel(
      baseData({ outputs: [{ name: 'ok', type: 'bool' }] }),
    );

    const checkbox = document.querySelector('.tep-field-value-cell input[type="checkbox"]');
    expect(checkbox).toBeTruthy();
    fireEvent.click(checkbox!);

    const [, , updatedData] = onUpdate.mock.calls.at(-1)!;
    expect(updatedData.outputs).toEqual([{ name: 'ok', type: 'bool', value: true }]);
  });

  it('renders a datetime-local input for a timestamp output', () => {
    renderPanel(baseData({ outputs: [{ name: 'ts', type: 'timestamp' }] }));

    const input = document.querySelector('.tep-field-value-cell input') as HTMLInputElement;
    expect(input.type).toBe('datetime-local');
  });

  it('renders no editor for a non-tier-1 output type', () => {
    renderPanel(baseData({ outputs: [{ name: 'frame', type: 'compas.geometry.Frame' }] }));

    expect(screen.queryByPlaceholderText('value')).toBeNull();
    expect(document.querySelector('.tep-value-unsupported')).toBeTruthy();
  });
});

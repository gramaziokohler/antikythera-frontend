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

});

describe('TaskEditPanel tier-3 output value editor: raw COMPAS JSON (issue-sim-04)', () => {
  it('renders a JSON textarea for a dotted COMPAS class path', () => {
    renderPanel(baseData({ outputs: [{ name: 'frame', type: 'compas.geometry.Frame' }] }));

    expect(document.querySelector('.tep-json-textarea')).toBeTruthy();
  });

  it('renders a JSON textarea for a dict output', () => {
    renderPanel(baseData({ outputs: [{ name: 'meta', type: 'dict' }] }));

    expect(document.querySelector('.tep-json-textarea')).toBeTruthy();
  });

  it('renders a JSON textarea for an unrecognised, malformed, or missing type', () => {
    renderPanel(
      baseData({
        outputs: [
          { name: 'a', type: 'not_a_real_type' },
          { name: 'b', type: 'list[' },
          { name: 'c' },
        ],
      }),
    );

    expect(document.querySelectorAll('.tep-json-textarea').length).toBe(3);
  });

  it('parses typed JSON and reports the parsed value', () => {
    const onUpdate = renderPanel(baseData({ outputs: [{ name: 'frame', type: 'compas.geometry.Frame' }] }));

    fireEvent.change(document.querySelector('.tep-json-textarea')!, {
      target: { value: '{"dtype": "compas.geometry.Frame", "data": {}}' },
    });

    const [, , updatedData] = onUpdate.mock.calls.at(-1)!;
    expect(updatedData.outputs).toEqual([
      { name: 'frame', type: 'compas.geometry.Frame', value: { dtype: 'compas.geometry.Frame', data: {} } },
    ]);
  });

  it('reports invalid JSON inline without emitting an update', () => {
    const onUpdate = renderPanel(baseData({ outputs: [{ name: 'frame', type: 'compas.geometry.Frame' }] }));
    onUpdate.mockClear();

    fireEvent.change(document.querySelector('.tep-json-textarea')!, {
      target: { value: '{not valid json' },
    });

    expect(screen.getByText('Invalid JSON')).toBeTruthy();
    expect(document.querySelector('.tep-json-invalid')).toBeTruthy();
    expect(onUpdate).not.toHaveBeenCalled();
  });
});

describe('TaskEditPanel tier-2 output value editor: list[T] (issue-sim-04)', () => {
  it('renders no items and an add button for an empty list[str] output', () => {
    renderPanel(baseData({ outputs: [{ name: 'labels', type: 'list[str]' }] }));

    expect(document.querySelectorAll('.tep-list-item').length).toBe(0);
    expect(screen.getByText('Add item')).toBeTruthy();
  });

  it('adds a tier-1 item editor for list[str] and reports the value', () => {
    const onUpdate = renderPanel(baseData({ outputs: [{ name: 'labels', type: 'list[str]' }] }));

    fireEvent.click(screen.getByText('Add item'));
    let [, , updatedData] = onUpdate.mock.calls.at(-1)!;
    expect(updatedData.outputs[0].value).toEqual([undefined]);

    fireEvent.change(document.querySelector('.tep-list-item-value input')!, {
      target: { value: 'first' },
    });
    [, , updatedData] = onUpdate.mock.calls.at(-1)!;
    expect(updatedData.outputs[0].value).toEqual(['first']);
  });

  it('removes an item from the list', () => {
    const onUpdate = renderPanel(
      baseData({ outputs: [{ name: 'labels', type: 'list[str]', value: ['a', 'b'] }] }),
    );

    const removeButtons = document.querySelectorAll('.tep-list-item .tep-del-btn');
    fireEvent.click(removeButtons[0]);

    const [, , updatedData] = onUpdate.mock.calls.at(-1)!;
    expect(updatedData.outputs[0].value).toEqual(['b']);
  });

  it('renders a JSON textarea item editor for list[T] where T is a dotted class path', () => {
    renderPanel(
      baseData({ outputs: [{ name: 'frames', type: 'list[compas.geometry.Frame]', value: [{}] }] }),
    );

    expect(document.querySelector('.tep-list-item-value .tep-json-textarea')).toBeTruthy();
  });
});

describe('TaskEditPanel simulation opt-out toggle (issue-sim-05)', () => {
  it('is unchecked by default and sets the reserved param when checked', () => {
    const onUpdate = renderPanel(baseData());

    const checkbox = screen.getByLabelText('Use real agent (opt out of simulation)') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    fireEvent.click(checkbox);

    const [, , updatedData] = onUpdate.mock.calls.at(-1)!;
    expect(updatedData.params).toEqual([{ name: '__sim_use_real_agent__', value: true }]);
  });

  it('is checked when the reserved param is already present, and unchecking removes it', () => {
    const onUpdate = renderPanel(
      baseData({ params: [{ name: 'speed', value: 1.5 }, { name: '__sim_use_real_agent__', value: true }] }),
    );

    const checkbox = screen.getByLabelText('Use real agent (opt out of simulation)') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    fireEvent.click(checkbox);

    const [, , updatedData] = onUpdate.mock.calls.at(-1)!;
    expect(updatedData.params).toEqual([{ name: 'speed', value: 1.5 }]);
  });

  it('does not render the toggle for a system task', () => {
    renderPanel(baseData({ taskType: 'system.start' }));

    expect(screen.queryByLabelText('Use real agent (opt out of simulation)')).toBeNull();
  });

  it('hides the reserved param from the generic Parameters list', () => {
    renderPanel(
      baseData({ params: [{ name: 'speed', value: 1.5 }, { name: '__sim_use_real_agent__', value: true }] }),
    );

    expect(screen.queryByDisplayValue('__sim_use_real_agent__')).toBeNull();
    expect(screen.getByDisplayValue('speed')).toBeTruthy();
  });

  it('shows an inapplicable placeholder instead of the output editor when opted out', () => {
    renderPanel(
      baseData({
        outputs: [{ name: 'trajectory', type: 'str', value: 'ok' }],
        params: [{ name: '__sim_use_real_agent__', value: true }],
      }),
    );

    expect(screen.getByText('Real agent produces this output')).toBeTruthy();
    expect(screen.queryByPlaceholderText('value')).toBeNull();
  });
});

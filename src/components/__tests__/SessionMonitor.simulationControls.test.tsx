import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SessionMonitor } from '../SessionMonitor'
import { markDrivingSimulationSession } from '../../utils/simulation-session'

// issue-sim-07: the delay control and the driving/watching indicator. Exercises the real
// useSessionStream, useSimulationStandIn and SimulationAgent (so the badge/control genuinely
// reflect live graph task types and real agent state), stubbing only the two external-system
// singletons (MqttService, AgentLauncher) the way useSimulationStandIn.test.ts already does.

class MockEventSource {
  onerror: ((ev: Event) => void) | null = null
  addEventListener() {}
  removeEventListener() {}
  close() {}
}

const registerAgent = vi.fn()
const unregisterAgent = vi.fn()

vi.mock('../../services/MqttService', () => ({
  MqttService: { getInstance: vi.fn(() => ({})) },
}))

vi.mock('../../agents/AgentLauncher', () => ({
  AgentLauncher: { getInstance: vi.fn(() => ({ registerAgent, unregisterAgent })) },
}))

vi.mock('../SessionGraph', () => ({ SessionGraph: () => null }))
vi.mock('../StartSessionDialog', () => ({ StartSessionDialog: () => null }))
vi.mock('../datastore/DataStoreExplorer', () => ({ DataStoreExplorer: () => null }))
vi.mock('../graph/NodeContextMenu', () => ({ NodeContextMenu: () => null }))

const SESSION_ID = 'sess-sim-07'
const API_BASE = 'http://api'
const SIM_BLUEPRINT_ID = 'bp-1__sim'
const PLAIN_BLUEPRINT_ID = 'bp-1'

function blueprintWithTaskType(id: string, taskType: string) {
  return {
    data: {
      id,
      tasks: [
        {
          data: {
            id: 'task-a',
            state: 'running',
            type: taskType,
            description: null,
            depends_on: [],
            params: [],
            inputs: [],
            outputs: [],
          },
        },
      ],
      scopes: [],
    },
  }
}

const simulatedBlueprint = blueprintWithTaskType(SIM_BLUEPRINT_ID, 'simulation.demo.tool')
const plainBlueprint = blueprintWithTaskType(PLAIN_BLUEPRINT_ID, 'demo.tool')

function makeFetchMock(blueprint: unknown) {
  return vi.fn(async (url: string) => {
    if ((url as string).includes('/blueprint')) return { ok: true, json: async () => blueprint }
    if ((url as string).endsWith('/data')) return { ok: true, json: async () => ({ session_id: SESSION_ID, state: 'running', data: '{}' }) }
    return { ok: true, json: async () => ({ data: { state: 'running', params: {} } }) }
  })
}

beforeEach(() => {
  sessionStorage.clear()
  registerAgent.mockClear()
  unregisterAgent.mockClear()
  vi.stubGlobal('EventSource', MockEventSource)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('SessionMonitor simulation controls (issue-sim-07)', () => {
  it('shows no simulation indicator or controls for a non-simulated session', async () => {
    vi.stubGlobal('fetch', makeFetchMock(plainBlueprint))

    render(
      <SessionMonitor apiBaseUrl={API_BASE} sessionId={SESSION_ID} blueprintId={PLAIN_BLUEPRINT_ID} onClose={vi.fn()} />
    )

    await waitFor(() => expect(document.querySelector('.state-badge')).not.toBeNull())

    expect(document.querySelector('.sim-mode-badge')).toBeNull()
    expect(screen.queryByLabelText('Simulation delay in milliseconds')).toBeNull()
    expect(screen.queryByTitle(/Break on every task/)).toBeNull()
    expect(registerAgent).not.toHaveBeenCalled()
  })

  it('shows "Driving simulation" plus the step-through and delay controls on the driving tab', async () => {
    markDrivingSimulationSession(SESSION_ID, SIM_BLUEPRINT_ID)
    vi.stubGlobal('fetch', makeFetchMock(simulatedBlueprint))

    render(
      <SessionMonitor apiBaseUrl={API_BASE} sessionId={SESSION_ID} blueprintId={SIM_BLUEPRINT_ID} onClose={vi.fn()} />
    )

    await waitFor(() => expect(document.querySelector('.sim-mode-badge')).not.toBeNull())

    expect(document.querySelector('.sim-mode-badge')?.textContent).toBe('Driving simulation')
    expect(document.querySelector('.sim-mode-badge')?.classList.contains('driving')).toBe(true)
    expect(registerAgent).toHaveBeenCalledTimes(1)

    const delayInput = screen.getByLabelText('Simulation delay in milliseconds') as HTMLInputElement
    expect(delayInput.value).toBe('0')
  })

  it('shows "Watching simulation" and hides driving-only controls on a non-driving tab of the same simulated session', async () => {
    // Some other tab drove it; this tab did not press Simulate.
    markDrivingSimulationSession('some-other-session', 'some-other-bp__sim')
    vi.stubGlobal('fetch', makeFetchMock(simulatedBlueprint))

    render(
      <SessionMonitor apiBaseUrl={API_BASE} sessionId={SESSION_ID} blueprintId={SIM_BLUEPRINT_ID} onClose={vi.fn()} />
    )

    await waitFor(() => expect(document.querySelector('.sim-mode-badge')).not.toBeNull())

    expect(document.querySelector('.sim-mode-badge')?.textContent).toBe('Watching simulation')
    expect(document.querySelector('.sim-mode-badge')?.classList.contains('watching')).toBe(true)
    expect(registerAgent).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Simulation delay in milliseconds')).toBeNull()
    expect(screen.queryByTitle(/Break on every task/)).toBeNull()
  })
})

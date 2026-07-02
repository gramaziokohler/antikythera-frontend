import { render, cleanup, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SessionMonitor } from '../SessionMonitor'
import type { GraphData } from '../../types'

// This suite exercises the real useSessionStream hook (unmocked) so it can
// verify that SSE updates delivered while viewing an inner (composite task)
// blueprint actually reach the rendered graph — not just the hook's internal
// state. issue-sse-09: SessionMonitor used to gate hookGraphData sync on
// `blueprintStack.length === 0`, so once a user drilled into a composite
// task, further SSE patches had nowhere to go.

class MockEventSource {
  static lastInstance: MockEventSource | null = null

  readonly url: string
  onerror: ((ev: Event) => void) | null = null
  closed = false

  private listeners: Record<string, Array<(ev: MessageEvent) => void>> = {}

  constructor(url: string) {
    this.url = url
    MockEventSource.lastInstance = this
  }

  addEventListener(type: string, listener: (ev: MessageEvent) => void) {
    ;(this.listeners[type] ??= []).push(listener)
  }

  removeEventListener(type: string, listener: (ev: MessageEvent) => void) {
    this.listeners[type] = (this.listeners[type] ?? []).filter(l => l !== listener)
  }

  close() {
    this.closed = true
  }

  emit(type: string, data: unknown) {
    const ev = { data: JSON.stringify(data) } as MessageEvent
    this.listeners[type]?.forEach(l => l(ev))
  }
}

// Capture whatever SessionMonitor last handed to SessionGraph, so assertions
// exercise the displayed graph (the view), not the hook's return value.
type CapturedGraphProps = { data: GraphData; onNodeDoubleClick?: (e: unknown, node: unknown) => void }
let lastGraphProps: CapturedGraphProps | null = null

vi.mock('../SessionGraph', () => ({
  SessionGraph: (props: CapturedGraphProps) => {
    lastGraphProps = props
    return null
  },
}))
vi.mock('../StartSessionDialog', () => ({ StartSessionDialog: () => null }))
vi.mock('../datastore/DataStoreExplorer', () => ({ DataStoreExplorer: () => null }))
vi.mock('../graph/NodeContextMenu', () => ({ NodeContextMenu: () => null }))

const SESSION_ID = 'sess-inner'
const API_BASE = 'http://api'
const TOP_BLUEPRINT_ID = 'main-bp'
const INNER_BLUEPRINT_ID = 'inner-bp'

const topBlueprint = {
  data: {
    id: TOP_BLUEPRINT_ID,
    tasks: [
      {
        data: {
          id: 'task-a',
          state: 'succeeded',
          type: 'SomeTask',
          description: null,
          depends_on: [],
          params: [],
          inputs: [],
          outputs: [],
        },
      },
      {
        data: {
          id: 'composite-1',
          state: 'running',
          type: 'CompositeTask',
          description: null,
          depends_on: [{ data: { id: 'task-a' } }],
          params: [
            { data: { name: 'blueprint', value: { static: INNER_BLUEPRINT_ID } } },
          ],
          inputs: [],
          outputs: [],
        },
      },
    ],
    scopes: [],
  },
}

const innerBlueprint = {
  data: {
    id: INNER_BLUEPRINT_ID,
    tasks: [
      {
        data: {
          id: 'inner-task-a',
          state: 'pending',
          type: 'SomeTask',
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

const sessionDetails = {
  data: { blueprint: topBlueprint, params: {}, state: 'running' },
}

const sessionData = { session_id: SESSION_ID, state: 'running', data: '{}' }

function makeFetchMock() {
  return vi.fn(async (url: string) => {
    if (url.includes('/blueprint/')) {
      const id = url.split('/blueprint/')[1]
      if (id === INNER_BLUEPRINT_ID) return { ok: true, json: async () => innerBlueprint }
      return { ok: true, json: async () => topBlueprint }
    }
    if (url.endsWith('/blueprint')) {
      return { ok: true, json: async () => topBlueprint }
    }
    if (url.endsWith('/data')) {
      return { ok: true, json: async () => sessionData }
    }
    return { ok: true, json: async () => sessionDetails }
  })
}

beforeEach(() => {
  MockEventSource.lastInstance = null
  lastGraphProps = null
  vi.stubGlobal('EventSource', MockEventSource)
  vi.stubGlobal('fetch', makeFetchMock())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('SessionMonitor inner blueprint live updates (issue-sse-09)', () => {
  it('applies an SSE task_state_changed event for an inner blueprint to the displayed graph', async () => {
    render(
      <SessionMonitor
        apiBaseUrl={API_BASE}
        sessionId={SESSION_ID}
        blueprintId={TOP_BLUEPRINT_ID}
        onClose={vi.fn()}
      />
    )

    // Wait for the top-level blueprint to be displayed.
    await waitFor(() =>
      expect(lastGraphProps?.data?.nodes.some(n => n.id === 'composite-1')).toBe(true)
    )

    // Drill into the composite task's inner blueprint.
    await act(async () => {
      lastGraphProps!.onNodeDoubleClick?.(null, { data: { internalBlueprintId: INNER_BLUEPRINT_ID } })
    })

    await waitFor(() =>
      expect(lastGraphProps?.data?.nodes.some(n => n.id === 'inner-task-a')).toBe(true)
    )
    expect(lastGraphProps!.data.nodes.find(n => n.id === 'inner-task-a')!.status).toBe('pending')

    await waitFor(() => expect(MockEventSource.lastInstance).not.toBeNull())

    // Deliver a live SSE update scoped to the inner blueprint.
    act(() => {
      MockEventSource.lastInstance!.emit('task_state_changed', {
        blueprint_id: INNER_BLUEPRINT_ID,
        task_id: 'inner-task-a',
        state: 'succeeded',
      })
    })

    // The displayed graph (not just the hook's internal state) must reflect it.
    await waitFor(() =>
      expect(lastGraphProps!.data.nodes.find(n => n.id === 'inner-task-a')!.status).toBe('succeeded')
    )
  })

  it('fetches the root blueprint snapshot exactly once on session open (issue-sse-10)', async () => {
    const fetchMock = makeFetchMock()
    vi.stubGlobal('fetch', fetchMock)

    render(
      <SessionMonitor
        apiBaseUrl={API_BASE}
        sessionId={SESSION_ID}
        blueprintId={TOP_BLUEPRINT_ID}
        onClose={vi.fn()}
      />
    )

    await waitFor(() =>
      expect(lastGraphProps?.data?.nodes.some(n => n.id === 'composite-1')).toBe(true)
    )

    // SessionMonitor's session-init effect used to fetch GET .../blueprint
    // itself, duplicating useSessionStream's own fetch of the same URL.
    const rootBlueprintCalls = fetchMock.mock.calls.filter(([url]) =>
      (url as string).endsWith('/blueprint')
    )
    expect(rootBlueprintCalls).toHaveLength(1)
  })
})

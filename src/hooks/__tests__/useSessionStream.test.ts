import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useSessionStream } from '../useSessionStream'

// Minimal EventSource mock that emits named SSE events programmatically.
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

  triggerError() {
    this.onerror?.(new Event('error'))
  }
}

const SESSION_ID = 'sess-1'
const API_BASE = 'http://api'
const BLUEPRINT_ID = 'bp-1'

const mockBlueprint = {
  data: {
    id: BLUEPRINT_ID,
    tasks: [
      {
        data: {
          id: 'task-a',
          state: 'pending',
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
          id: 'task-b',
          state: 'running',
          type: 'SomeTask',
          description: null,
          depends_on: [{ data: { id: 'task-a' } }],
          params: [],
          inputs: [],
          outputs: [],
        },
      },
    ],
    scopes: [],
  },
}

const mockSessionDetails = { data: { state: 'running' } }

function makeFetchMock(blueprint = mockBlueprint, sessionDetails = mockSessionDetails) {
  return vi.fn(async (url: string) => {
    if ((url as string).includes('/blueprint')) {
      return { ok: true, json: async () => blueprint }
    }
    return { ok: true, json: async () => sessionDetails }
  })
}

beforeEach(() => {
  MockEventSource.lastInstance = null
  vi.stubGlobal('EventSource', MockEventSource)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useSessionStream', () => {
  it('returns null graphData and pending state when sessionId is null', () => {
    const { result } = renderHook(() =>
      useSessionStream(null, API_BASE, BLUEPRINT_ID)
    )
    expect(result.current.graphData).toBeNull()
    expect(result.current.sessionState).toBe('pending')
  })

  it('fetches blueprint snapshot on mount and builds graphData', async () => {
    vi.stubGlobal('fetch', makeFetchMock())

    const { result } = renderHook(() =>
      useSessionStream(SESSION_ID, API_BASE, BLUEPRINT_ID)
    )

    await waitFor(() => expect(result.current.graphData).not.toBeNull())

    expect(result.current.graphData!.nodes).toHaveLength(2)
    expect(result.current.graphData!.nodes[0].id).toBe('task-a')
    expect(result.current.graphData!.nodes[0].status).toBe('pending')
    expect(result.current.graphData!.nodes[1].id).toBe('task-b')
    expect(result.current.sessionState).toBe('running')
    expect(MockEventSource.lastInstance).not.toBeNull()
    expect(MockEventSource.lastInstance!.url).toBe(`${API_BASE}/sessions/${SESSION_ID}/stream`)
  })

  it('patches the correct node status on task_state_changed', async () => {
    vi.stubGlobal('fetch', makeFetchMock())

    const { result } = renderHook(() =>
      useSessionStream(SESSION_ID, API_BASE, BLUEPRINT_ID)
    )

    await waitFor(() => expect(result.current.graphData).not.toBeNull())
    expect(result.current.graphData!.nodes[0].status).toBe('pending')

    act(() => {
      MockEventSource.lastInstance!.emit('task_state_changed', {
        blueprint_id: BLUEPRINT_ID,
        task_id: 'task-a',
        state: 'succeeded',
      })
    })

    expect(result.current.graphData!.nodes[0].status).toBe('succeeded')
    // task-b should be unaffected
    expect(result.current.graphData!.nodes[1].status).toBe('running')
  })

  it('ignores task_state_changed for a different blueprint_id', async () => {
    vi.stubGlobal('fetch', makeFetchMock())

    const { result } = renderHook(() =>
      useSessionStream(SESSION_ID, API_BASE, BLUEPRINT_ID)
    )

    await waitFor(() => expect(result.current.graphData).not.toBeNull())

    act(() => {
      MockEventSource.lastInstance!.emit('task_state_changed', {
        blueprint_id: 'other-bp',
        task_id: 'task-a',
        state: 'succeeded',
      })
    })

    // Status unchanged because blueprint_id doesn't match
    expect(result.current.graphData!.nodes[0].status).toBe('pending')
  })

  it('updates sessionState on session_state_changed', async () => {
    vi.stubGlobal('fetch', makeFetchMock())

    const { result } = renderHook(() =>
      useSessionStream(SESSION_ID, API_BASE, BLUEPRINT_ID)
    )

    await waitFor(() => expect(result.current.graphData).not.toBeNull())
    expect(result.current.sessionState).toBe('running')

    act(() => {
      MockEventSource.lastInstance!.emit('session_state_changed', { state: 'completed' })
    })

    expect(result.current.sessionState).toBe('completed')
  })

  it('closes EventSource and re-fetches snapshot on error', async () => {
    vi.stubGlobal('fetch', makeFetchMock())

    const { result } = renderHook(() =>
      // reconnectDelay: 0 so the timer fires immediately in tests
      useSessionStream(SESSION_ID, API_BASE, BLUEPRINT_ID, { reconnectDelay: 0 })
    )

    await waitFor(() => expect(MockEventSource.lastInstance).not.toBeNull())
    const firstEs = MockEventSource.lastInstance!
    const fetchMock = vi.mocked(global.fetch as ReturnType<typeof vi.fn>)
    const callsBefore = fetchMock.mock.calls.length

    act(() => { firstEs.triggerError() })

    await waitFor(() => expect(MockEventSource.lastInstance).not.toBe(firstEs))

    expect(firstEs.closed).toBe(true)
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBefore)
    expect(MockEventSource.lastInstance).not.toBeNull()
  })

  it('closes EventSource on unmount', async () => {
    vi.stubGlobal('fetch', makeFetchMock())

    const { unmount } = renderHook(() =>
      useSessionStream(SESSION_ID, API_BASE, BLUEPRINT_ID)
    )

    await waitFor(() => expect(MockEventSource.lastInstance).not.toBeNull())
    const es = MockEventSource.lastInstance!

    unmount()

    expect(es.closed).toBe(true)
  })

  it('closes old EventSource and reconnects when sessionId changes', async () => {
    vi.stubGlobal('fetch', makeFetchMock())

    const { rerender } = renderHook(
      ({ sid }: { sid: string }) => useSessionStream(sid, API_BASE, BLUEPRINT_ID),
      { initialProps: { sid: SESSION_ID } }
    )

    await waitFor(() => expect(MockEventSource.lastInstance).not.toBeNull())
    const firstEs = MockEventSource.lastInstance!

    rerender({ sid: 'sess-2' })

    await waitFor(() => expect(MockEventSource.lastInstance).not.toBe(firstEs))
    expect(firstEs.closed).toBe(true)
  })

  it('manual reconnect() re-fetches snapshot and opens a new stream', async () => {
    vi.stubGlobal('fetch', makeFetchMock())

    const { result } = renderHook(() =>
      useSessionStream(SESSION_ID, API_BASE, BLUEPRINT_ID)
    )

    await waitFor(() => expect(MockEventSource.lastInstance).not.toBeNull())
    const firstEs = MockEventSource.lastInstance!
    const fetchMock = vi.mocked(global.fetch as ReturnType<typeof vi.fn>)
    const callsBefore = fetchMock.mock.calls.length

    act(() => { result.current.reconnect() })

    await waitFor(() => expect(MockEventSource.lastInstance).not.toBe(firstEs))
    expect(firstEs.closed).toBe(true)
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBefore)
  })
})

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

const mockSessionData = { session_id: 'sess-1', state: 'running', data: '{}' }

function makeFetchMock(blueprint = mockBlueprint, sessionDetails = mockSessionDetails, sessionData = mockSessionData) {
  return vi.fn(async (url: string) => {
    if ((url as string).includes('/blueprint')) {
      return { ok: true, json: async () => blueprint }
    }
    if ((url as string).includes('/data')) {
      return { ok: true, json: async () => sessionData }
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
    const fetchMock = vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>)
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
    const fetchMock = vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>)
    const callsBefore = fetchMock.mock.calls.length

    act(() => { result.current.reconnect() })

    await waitFor(() => expect(MockEventSource.lastInstance).not.toBe(firstEs))
    expect(firstEs.closed).toBe(true)
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBefore)
  })

  it('filters outer blueprint events when visibleBlueprintId changes to an inner blueprint', async () => {
    vi.stubGlobal('fetch', makeFetchMock())

    const { result, rerender } = renderHook(
      ({ bpId }: { bpId: string }) => useSessionStream(SESSION_ID, API_BASE, bpId),
      { initialProps: { bpId: BLUEPRINT_ID } }
    )

    await waitFor(() => expect(result.current.graphData).not.toBeNull())
    expect(result.current.graphData!.nodes[0].status).toBe('pending')

    // Simulate user drilling into a composite task — visible blueprint switches to inner
    rerender({ bpId: 'inner-bp' })

    // Outer blueprint event arrives — must be discarded
    act(() => {
      MockEventSource.lastInstance!.emit('task_state_changed', {
        blueprint_id: BLUEPRINT_ID,
        task_id: 'task-a',
        state: 'succeeded',
      })
    })

    expect(result.current.graphData!.nodes[0].status).toBe('pending')
  })

  it('resumes processing outer blueprint events after visibleBlueprintId reverts on navigate-back', async () => {
    vi.stubGlobal('fetch', makeFetchMock())

    const { result, rerender } = renderHook(
      ({ bpId }: { bpId: string }) => useSessionStream(SESSION_ID, API_BASE, bpId),
      { initialProps: { bpId: BLUEPRINT_ID } }
    )

    await waitFor(() => expect(result.current.graphData).not.toBeNull())

    // Drill into inner blueprint then navigate back
    rerender({ bpId: 'inner-bp' })
    rerender({ bpId: BLUEPRINT_ID })

    // Outer event arrives after navigate-back — must be processed
    act(() => {
      MockEventSource.lastInstance!.emit('task_state_changed', {
        blueprint_id: BLUEPRINT_ID,
        task_id: 'task-a',
        state: 'succeeded',
      })
    })

    expect(result.current.graphData!.nodes[0].status).toBe('succeeded')
  })

  it('calls onDatastoreUpdate with __snapshot__ on connect', async () => {
    const snapshotData = { session_id: SESSION_ID, state: 'running', data: '{"main_blueprint":{}}' }
    vi.stubGlobal('fetch', makeFetchMock(mockBlueprint, mockSessionDetails, snapshotData))

    const onDatastoreUpdate = vi.fn()

    renderHook(() =>
      useSessionStream(SESSION_ID, API_BASE, BLUEPRINT_ID, { onDatastoreUpdate })
    )

    await waitFor(() => expect(onDatastoreUpdate).toHaveBeenCalled())

    expect(onDatastoreUpdate).toHaveBeenCalledWith('__snapshot__', snapshotData)
  })

  it('calls onDatastoreUpdate with blueprint_id and data on datastore_updated SSE event', async () => {
    vi.stubGlobal('fetch', makeFetchMock())

    const onDatastoreUpdate = vi.fn()

    renderHook(() =>
      useSessionStream(SESSION_ID, API_BASE, BLUEPRINT_ID, { onDatastoreUpdate })
    )

    await waitFor(() => expect(MockEventSource.lastInstance).not.toBeNull())
    // Flush the snapshot call so we can assert on the SSE event separately
    onDatastoreUpdate.mockClear()

    act(() => {
      MockEventSource.lastInstance!.emit('datastore_updated', {
        blueprint_id: BLUEPRINT_ID,
        data: { score: { value: 42, type: 'number' } },
      })
    })

    expect(onDatastoreUpdate).toHaveBeenCalledWith(
      BLUEPRINT_ID,
      { score: { value: 42, type: 'number' } }
    )
  })

  it('exposes the fetched blueprint snapshot so callers do not need their own fetch', async () => {
    vi.stubGlobal('fetch', makeFetchMock())

    const { result } = renderHook(() =>
      useSessionStream(SESSION_ID, API_BASE, BLUEPRINT_ID)
    )

    await waitFor(() => expect(result.current.blueprint).not.toBeNull())
    expect(result.current.blueprint).toEqual(mockBlueprint)
  })

  it('does not drop a task_state_changed event that arrives right after opening with no visible blueprint yet', async () => {
    // Mirrors SessionMonitor on session mount: it doesn't know the visible
    // blueprint id until a snapshot resolves, so it passes null/undefined
    // for visibleBlueprintId on the first render.
    vi.stubGlobal('fetch', makeFetchMock())

    const { result } = renderHook(() =>
      useSessionStream(SESSION_ID, API_BASE, null)
    )

    await waitFor(() => expect(MockEventSource.lastInstance).not.toBeNull())

    // Event carries the real blueprint id (the snapshot's own id) — the hook
    // must have resolved this internally already, without waiting for a
    // caller-supplied visibleBlueprintId prop to round-trip back in.
    act(() => {
      MockEventSource.lastInstance!.emit('task_state_changed', {
        blueprint_id: BLUEPRINT_ID,
        task_id: 'task-a',
        state: 'succeeded',
      })
    })

    expect(result.current.graphData!.nodes[0].status).toBe('succeeded')
  })

  it('fetches the blueprint snapshot exactly once for a session open with no visible blueprint yet', async () => {
    const fetchMock = makeFetchMock()
    vi.stubGlobal('fetch', fetchMock)

    renderHook(() => useSessionStream(SESSION_ID, API_BASE, null))

    await waitFor(() => expect(MockEventSource.lastInstance).not.toBeNull())

    const blueprintCalls = (fetchMock.mock.calls as Array<[string]>).filter(([url]) =>
      url.endsWith('/blueprint')
    )
    expect(blueprintCalls).toHaveLength(1)
  })

  it('calls onDatastoreUpdate with __snapshot__ again on reconnect', async () => {
    vi.stubGlobal('fetch', makeFetchMock())

    const onDatastoreUpdate = vi.fn()

    const { result } = renderHook(() =>
      useSessionStream(SESSION_ID, API_BASE, BLUEPRINT_ID, { reconnectDelay: 0, onDatastoreUpdate })
    )

    await waitFor(() => expect(MockEventSource.lastInstance).not.toBeNull())
    const callsBefore = onDatastoreUpdate.mock.calls.filter(c => c[0] === '__snapshot__').length

    act(() => { result.current.reconnect() })

    await waitFor(() =>
      expect(onDatastoreUpdate.mock.calls.filter(c => c[0] === '__snapshot__').length).toBeGreaterThan(callsBefore)
    )
  })
})

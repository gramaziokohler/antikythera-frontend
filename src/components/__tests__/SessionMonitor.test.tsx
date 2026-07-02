import { render, screen, act, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SessionMonitor } from '../SessionMonitor'

// Module-level refs to control the mocked hook from test bodies.
// The factory closes over these objects; by the time useSessionStream is
// actually called (during render), they are fully initialised.
const mockState = { initial: 'running' as string }
const streamControl = { set: (_: string) => {} }

vi.mock('../../hooks/useSessionStream', async () => {
  const { useState } = await import('react')
  return {
    useSessionStream: () => {
      const [sessionState, setSessionState] = useState(mockState.initial)
      streamControl.set = setSessionState
      return { graphData: null, sessionState, reconnect: vi.fn() }
    },
  }
})

// Mock heavy child components that bring in ReactFlow / complex deps
vi.mock('../SessionGraph', () => ({ SessionGraph: () => null }))
vi.mock('../StartSessionDialog', () => ({ StartSessionDialog: () => null }))
vi.mock('../datastore/DataStoreExplorer', () => ({ DataStoreExplorer: () => null }))
vi.mock('../graph/NodeContextMenu', () => ({ NodeContextMenu: () => null }))

const SESSION_ID = 'sess-abc'
const API_BASE = 'http://api'
const BLUEPRINT_ID = 'bp-1'

function makeFetch() {
  return vi.fn(async (url: string) => {
    if ((url as string).includes('/blueprint')) {
      return { ok: true, json: async () => ({ data: { id: BLUEPRINT_ID, tasks: [], scopes: [] } }) }
    }
    return { ok: true, json: async () => ({ data: { state: mockState.initial, params: {} } }) }
  })
}

function renderMonitor() {
  return render(
    <SessionMonitor
      apiBaseUrl={API_BASE}
      sessionId={SESSION_ID}
      blueprintId={BLUEPRINT_ID}
      onClose={vi.fn()}
    />
  )
}

function badge() {
  return document.querySelector('.state-badge')
}

beforeEach(() => {
  mockState.initial = 'running'
  vi.stubGlobal('fetch', makeFetch())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('SessionMonitor optimistic pause/resume', () => {
  it('clicking Pause updates the badge to paused immediately', async () => {
    renderMonitor()

    // Wait for initial sync: hook returns 'running', effect sets local state
    await waitFor(() => expect(badge()?.textContent).toBe('running'))

    // Replace fetch so the pause POST never settles — proving update is immediate
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )

    fireEvent.click(screen.getByTitle('Pause Session'))

    // Must not need to wait — optimistic update is synchronous
    expect(badge()?.textContent).toBe('paused')
  })

  it('clicking Resume updates the badge to running immediately', async () => {
    mockState.initial = 'paused'
    renderMonitor()

    await waitFor(() => expect(badge()?.textContent).toBe('paused'))

    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )

    fireEvent.click(screen.getByTitle('Resume/Start Session'))

    expect(badge()?.textContent).toBe('running')
  })

  it('a subsequent session_state_changed event overrides the optimistic state', async () => {
    renderMonitor()

    await waitFor(() => expect(badge()?.textContent).toBe('running'))

    // Optimistic pause
    fireEvent.click(screen.getByTitle('Pause Session'))
    expect(badge()?.textContent).toBe('paused')

    // Stream delivers a correcting state (e.g. server interrupted → completed)
    await act(async () => {
      streamControl.set('completed')
    })

    await waitFor(() => expect(badge()?.textContent).toBe('completed'))
  })

  it('reverts to the pre-click state when the pause POST fails', async () => {
    renderMonitor()

    await waitFor(() => expect(badge()?.textContent).toBe('running'))

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))

    fireEvent.click(screen.getByTitle('Pause Session'))
    expect(badge()?.textContent).toBe('paused')

    await waitFor(() => expect(badge()?.textContent).toBe('running'))
  })

  it('reverts to the pre-click state when the resume POST fails', async () => {
    mockState.initial = 'paused'
    renderMonitor()

    await waitFor(() => expect(badge()?.textContent).toBe('paused'))

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))

    fireEvent.click(screen.getByTitle('Resume/Start Session'))
    expect(badge()?.textContent).toBe('running')

    await waitFor(() => expect(badge()?.textContent).toBe('paused'))
  })

  it('an SSE correction arriving after a pause failure wins over the revert', async () => {
    renderMonitor()

    await waitFor(() => expect(badge()?.textContent).toBe('running'))

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))

    fireEvent.click(screen.getByTitle('Pause Session'))
    expect(badge()?.textContent).toBe('paused')

    // Wait for the failed POST to settle and the revert to apply.
    await waitFor(() => expect(badge()?.textContent).toBe('running'))

    // A real correction arrives afterwards and must win.
    await act(async () => {
      streamControl.set('completed')
    })

    await waitFor(() => expect(badge()?.textContent).toBe('completed'))
  })
})

import { render, act, waitFor, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SessionMonitor } from '../SessionMonitor'
import { notifications } from '../../services/NotificationStore'
import type { Notification } from '../NotificationOverlay'

const mockState = { initial: 'running' as string }
const streamControl: { set: (state: string) => void } = { set: () => {} }

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

vi.mock('../SessionGraph', () => ({ SessionGraph: () => null }))
vi.mock('../StartSessionDialog', () => ({ StartSessionDialog: () => null }))
vi.mock('../datastore/DataStoreExplorer', () => ({ DataStoreExplorer: () => null }))
vi.mock('../graph/NodeContextMenu', () => ({ NodeContextMenu: () => null }))

const SESSION_ID = 'sess-abc'
const API_BASE = 'http://api'
const BLUEPRINT_ID = 'bp-1'

const TASK_ERROR = {
  dtype: 'antikythera.models/TaskError',
  data: {
    code: 'SCOPE_CONDITION_ERROR',
    message: "Scope 'scope_open': cannot evaluate while condition 'elements_remaining > 0'.",
    details: 'scope_close',
  },
}

function makeFetch(lastTaskError: unknown) {
  return vi.fn(async (url: string) => {
    if (url.includes('/blueprint')) {
      return { ok: true, json: async () => ({ data: { id: BLUEPRINT_ID, tasks: [], scopes: [] } }) }
    }
    if (url.endsWith('/data')) {
      return { ok: true, json: async () => ({ data: {} }) }
    }
    return {
      ok: true,
      json: async () => ({ data: { state: mockState.initial, params: {}, last_task_error: lastTaskError } }),
    }
  })
}

function renderMonitor() {
  return render(
    <SessionMonitor apiBaseUrl={API_BASE} sessionId={SESSION_ID} blueprintId={BLUEPRINT_ID} onClose={vi.fn()} />
  )
}

function current(): Notification[] {
  let list: Notification[] = []
  notifications.subscribe(n => { list = n })()
  return list
}

beforeEach(() => {
  current().forEach(n => notifications.dismiss(n.id))
  mockState.initial = 'running'
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('SessionMonitor session failure reporting', () => {
  it('raises a notification carrying the failure reason', async () => {
    vi.stubGlobal('fetch', makeFetch(TASK_ERROR))
    renderMonitor()

    await act(async () => { streamControl.set('failed') })

    await waitFor(() => expect(current()).toHaveLength(1))

    const [notification] = current()
    expect(notification.level).toBe('error')
    expect(notification.title).toBe('Session failed: SCOPE_CONDITION_ERROR')
    expect(notification.message).toContain('elements_remaining')
    expect(notification.message).toContain('(scope_close)')
  })

  it('does not use the inline error line for the failure', async () => {
    vi.stubGlobal('fetch', makeFetch(TASK_ERROR))
    const { container } = renderMonitor()

    await act(async () => { streamControl.set('failed') })

    await waitFor(() => expect(current()).toHaveLength(1))
    expect(container.querySelector('p.error')).toBeNull()
  })

  it('stays quiet when the session failed without a recorded reason', async () => {
    vi.stubGlobal('fetch', makeFetch(null))
    renderMonitor()

    await act(async () => { streamControl.set('failed') })

    await waitFor(() => expect(current()).toHaveLength(0))
  })

  it('clears the failure notification once the session runs again', async () => {
    vi.stubGlobal('fetch', makeFetch(TASK_ERROR))
    renderMonitor()

    await act(async () => { streamControl.set('failed') })
    await waitFor(() => expect(current()).toHaveLength(1))

    await act(async () => { streamControl.set('running') })

    await waitFor(() => expect(current()).toHaveLength(0))
  })
})

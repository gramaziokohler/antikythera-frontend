import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { UploadBlueprint } from '../UploadBlueprint'
import { notifications } from '../../services/NotificationStore'
import type { Notification } from '../NotificationOverlay'

const API_BASE = 'http://api'

const PROBLEM =
  "Task 'scope_open': while condition 'elements_remaining > 0' reads 'elements_remaining', " +
  'which no task in this blueprint declares as an output.'

function current(): Notification[] {
  let list: Notification[] = []
  notifications.subscribe(n => { list = n })()
  return list
}

function uploadFile(name = 'scope_while.json') {
  const input = document.querySelector('.hidden-file-input') as HTMLInputElement
  fireEvent.change(input, { target: { files: [new File(['{}'], name, { type: 'application/json' })] } })
}

function mockResponse(ok: boolean, body: object, status = ok ? 201 : 400) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok, status, json: async () => body })))
}

beforeEach(() => {
  current().forEach(n => notifications.dismiss(n.id))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('UploadBlueprint rejection reporting', () => {
  it('raises each dataflow problem as an error notification', async () => {
    mockResponse(false, { detail: { message: 'Blueprint has 1 dataflow problem(s).', problems: [PROBLEM] } })
    render(<UploadBlueprint apiBaseUrl={API_BASE} />)

    uploadFile()

    await waitFor(() => expect(current()).toHaveLength(1))

    const [notification] = current()
    expect(notification.level).toBe('error')
    expect(notification.title).toBe('Rejected: scope_while.json')
    expect(notification.message).toBe(PROBLEM)
  })

  it('raises one notification per problem', async () => {
    mockResponse(false, { detail: { message: '2 problems', problems: [PROBLEM, 'another problem'] } })
    render(<UploadBlueprint apiBaseUrl={API_BASE} />)

    uploadFile()

    await waitFor(() => expect(current()).toHaveLength(2))
  })

  it('falls back to a plain string detail', async () => {
    mockResponse(false, { detail: 'Failed to parse blueprint file: bad json' })
    render(<UploadBlueprint apiBaseUrl={API_BASE} />)

    uploadFile()

    await waitFor(() => expect(current()).toHaveLength(1))
    expect(current()[0].message).toBe('Failed to parse blueprint file: bad json')
  })

  it('reports a generic reason when the body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => { throw new Error('not json') },
    })))
    render(<UploadBlueprint apiBaseUrl={API_BASE} />)

    uploadFile()

    await waitFor(() => expect(current()).toHaveLength(1))
    expect(current()[0].message).toContain('HTTP 500')
  })

  it('refreshes the rejection in place when the same file is uploaded again', async () => {
    mockResponse(false, { detail: { message: '1 problem', problems: [PROBLEM] } })
    render(<UploadBlueprint apiBaseUrl={API_BASE} />)

    uploadFile()
    await waitFor(() => expect(current()).toHaveLength(1))

    uploadFile()
    await waitFor(() => expect(current()).toHaveLength(1))
  })

  it('raises nothing and reports success for an accepted blueprint', async () => {
    mockResponse(true, { blueprint_id: 'clean', message: 'Blueprint uploaded successfully.' })
    render(<UploadBlueprint apiBaseUrl={API_BASE} />)

    uploadFile()

    await waitFor(() => expect(screen.getByText('Blueprint uploaded successfully.')).toBeTruthy())
    expect(current()).toHaveLength(0)
  })
})

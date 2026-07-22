import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { UploadBlueprint } from '../UploadBlueprint'
import { notifications } from '../../services/NotificationStore'
import type { Notification } from '../NotificationOverlay'

const API_BASE = 'http://api'

const WARNING =
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

function mockUpload(body: object) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => body })))
}

beforeEach(() => {
  current().forEach(n => notifications.dismiss(n.id))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('UploadBlueprint warnings', () => {
  it('raises dataflow warnings as notifications', async () => {
    mockUpload({ blueprint_id: 'scope_while_example', message: 'Blueprint uploaded successfully.', warnings: [WARNING] })
    render(<UploadBlueprint apiBaseUrl={API_BASE} />)

    uploadFile()

    await waitFor(() => expect(current()).toHaveLength(1))

    const [notification] = current()
    expect(notification.level).toBe('warning')
    expect(notification.title).toBe('scope_while.json')
    expect(notification.message).toBe(WARNING)
  })

  it('still reports the upload as successful', async () => {
    mockUpload({ blueprint_id: 'scope_while_example', message: 'Blueprint uploaded successfully.', warnings: [WARNING] })
    render(<UploadBlueprint apiBaseUrl={API_BASE} />)

    uploadFile()

    await waitFor(() => expect(screen.getByText('Blueprint uploaded successfully.')).toBeTruthy())
  })

  it('raises nothing when the blueprint is clean', async () => {
    mockUpload({ blueprint_id: 'clean', message: 'Blueprint uploaded successfully.', warnings: [] })
    render(<UploadBlueprint apiBaseUrl={API_BASE} />)

    uploadFile()

    await waitFor(() => expect(screen.getByText('Blueprint uploaded successfully.')).toBeTruthy())
    expect(current()).toHaveLength(0)
  })

  it('refreshes warnings in place when the same blueprint is uploaded again', async () => {
    mockUpload({ blueprint_id: 'scope_while_example', message: 'Blueprint uploaded successfully.', warnings: [WARNING] })
    render(<UploadBlueprint apiBaseUrl={API_BASE} />)

    uploadFile()
    await waitFor(() => expect(current()).toHaveLength(1))

    uploadFile()
    await waitFor(() => expect(current()).toHaveLength(1))
  })
})

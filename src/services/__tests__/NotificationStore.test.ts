import { describe, it, expect, vi, beforeEach } from 'vitest'
import { notifications } from '../NotificationStore'
import type { Notification } from '../../components/NotificationOverlay'

function drain() {
  let current: Notification[] = []
  const unsubscribe = notifications.subscribe(list => { current = list })
  unsubscribe()
  current.forEach(n => notifications.dismiss(n.id))
}

beforeEach(drain)

describe('NotificationStore', () => {
  it('notifies subscribers immediately and on every change', () => {
    const listener = vi.fn()
    const unsubscribe = notifications.subscribe(listener)

    expect(listener).toHaveBeenCalledWith([])

    notifications.notify({ title: 'Hi', message: 'there', level: 'info' })

    expect(listener).toHaveBeenLastCalledWith([expect.objectContaining({ title: 'Hi', level: 'info' })])
    unsubscribe()
  })

  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn()
    notifications.subscribe(listener)()

    notifications.notify({ message: 'ignored', level: 'info' })

    expect(listener).toHaveBeenCalledTimes(1) // only the immediate call
  })

  it('replaces a notification raised again under the same id', () => {
    notifications.notify({ id: 'session-failed-1', message: 'first', level: 'error' })
    notifications.notify({ id: 'session-failed-1', message: 'second', level: 'error' })

    const listener = vi.fn()
    notifications.subscribe(listener)()

    const list: Notification[] = listener.mock.calls[0][0]
    expect(list).toHaveLength(1)
    expect(list[0].message).toBe('second')
  })

  it('keeps notifications with distinct ids, newest first', () => {
    notifications.notify({ id: 'a', message: 'older', level: 'info' })
    notifications.notify({ id: 'b', message: 'newer', level: 'info' })

    const listener = vi.fn()
    notifications.subscribe(listener)()

    expect(listener.mock.calls[0][0].map((n: Notification) => n.message)).toEqual(['newer', 'older'])
  })

  it('dismisses by id', () => {
    const id = notifications.notify({ message: 'bye', level: 'info' })
    notifications.dismiss(id)

    const listener = vi.fn()
    notifications.subscribe(listener)()

    expect(listener.mock.calls[0][0]).toEqual([])
  })
})

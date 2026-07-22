import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { NotificationOverlay, type Notification } from '../NotificationOverlay'

const SHORT = 'Session failed.'
const LONG =
  "Scope 'scope_open': cannot evaluate while condition 'elements_remaining > 0' " +
  "(NameError: name 'elements_remaining' is not defined). " +
  "Names available in session data: ['process_start_time']. (scope_close)"

function renderNotification(message: string) {
  const notification: Notification = {
    id: 'n1',
    title: 'Session failed: SCOPE_CONDITION_ERROR',
    message,
    level: 'error',
    timestamp: Date.now(),
  }
  return render(<NotificationOverlay notifications={[notification]} onDismiss={vi.fn()} />)
}

function messageText() {
  return document.querySelector('.notification-message')?.textContent ?? ''
}

afterEach(cleanup)

describe('NotificationOverlay message collapsing', () => {
  it('shows a short message in full with no toggle', () => {
    renderNotification(SHORT)

    expect(messageText()).toBe(SHORT)
    expect(screen.queryByRole('button', { name: /show more/ })).toBeNull()
  })

  it('collapses a long message behind a show more.. toggle', () => {
    renderNotification(LONG)

    const text = messageText()
    expect(text.length).toBeLessThan(LONG.length)
    expect(text.endsWith('…')).toBe(true)
    // Truncation happens on a word boundary, never mid-word.
    expect(LONG.startsWith(text.slice(0, -1))).toBe(true)
    expect(screen.getByRole('button', { name: 'show more..' })).toBeTruthy()
  })

  it('reveals the full message when show more.. is clicked, and collapses again', () => {
    renderNotification(LONG)

    fireEvent.click(screen.getByRole('button', { name: 'show more..' }))
    expect(messageText()).toBe(LONG)

    fireEvent.click(screen.getByRole('button', { name: 'show less' }))
    expect(messageText().endsWith('…')).toBe(true)
  })

  it('renders nothing when there are no notifications', () => {
    const { container } = render(<NotificationOverlay notifications={[]} onDismiss={vi.fn()} />)

    expect(container.firstChild).toBeNull()
  })
})

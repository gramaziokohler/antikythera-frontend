import type { Notification } from '../components/NotificationOverlay'

type Listener = (notifications: Notification[]) => void

/** A notification without the fields the store fills in. */
export type NotificationInput = Omit<Notification, 'id' | 'timestamp'> & { id?: string }

/**
 * App-wide notification list, rendered by whichever NotificationOverlay is mounted.
 *
 * A singleton rather than a React context so that any component can raise a
 * notification regardless of where it sits in the tree, matching how
 * MqttService and AgentLauncher are reached.
 */
class NotificationStore {
    private static instance: NotificationStore
    private notifications: Notification[] = []
    private listeners = new Set<Listener>()

    static getInstance(): NotificationStore {
        if (!NotificationStore.instance) {
            NotificationStore.instance = new NotificationStore()
        }
        return NotificationStore.instance
    }

    /** Subscribe to the list. Fires immediately with the current value. */
    subscribe(listener: Listener): () => void {
        this.listeners.add(listener)
        listener(this.notifications)
        return () => {
            this.listeners.delete(listener)
        }
    }

    /**
     * Raise a notification and return its id.
     *
     * Passing an explicit `id` replaces any notification already using it, so a
     * condition that is re-read (a session failure refetched on reconnect, say)
     * refreshes in place instead of stacking duplicates.
     */
    notify(notification: NotificationInput): string {
        const id = notification.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
        const rest = this.notifications.filter(n => n.id !== id)
        this.notifications = [{ ...notification, id, timestamp: Date.now() }, ...rest]
        this.emit()
        return id
    }

    dismiss(id: string): void {
        this.notifications = this.notifications.filter(n => n.id !== id)
        this.emit()
    }

    private emit(): void {
        this.listeners.forEach(listener => listener(this.notifications))
    }
}

export const notifications = NotificationStore.getInstance()

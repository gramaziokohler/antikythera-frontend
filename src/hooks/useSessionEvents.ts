import { useEffect, useRef, useCallback } from 'react';

/**
 * Event types emitted by the backend SSE stream.
 * Must stay in sync with `SessionEventType` in the Python backend.
 */
export type SessionEventType =
    | 'task_state_changed'
    | 'session_state_changed'
    | 'data_store_updated'
    | 'blueprint_updated'
    | 'connected';

export interface SessionEventHandler {
    /** Called whenever one or more tasks change state (PENDING → READY → RUNNING → …) */
    onTaskStateChanged?: () => void;
    /** Called when the overall session state changes (e.g. RUNNING → COMPLETED) */
    onSessionStateChanged?: () => void;
    /** Called when data is written to / removed from the session data store */
    onDataStoreUpdated?: () => void;
    /** Called when the blueprint structure changes (e.g. dynamic expansion) */
    onBlueprintUpdated?: () => void;
}

/**
 * React hook that connects to the backend SSE stream for a given session
 * and dispatches typed callbacks whenever server-side events arrive.
 *
 * The hook manages the `EventSource` lifecycle (connect / reconnect / cleanup)
 * and coalesces rapid-fire events of the same type using a short debounce
 * window so that the UI doesn't thrash.
 *
 * @param apiBaseUrl  Base URL of the orchestrator REST API.
 * @param sessionId   Session to subscribe to (or null to stay disconnected).
 * @param handlers    Callback map — only the handlers you provide will fire.
 * @param debounceMs  Minimum interval between dispatches of the *same* event
 *                    type (default 300 ms).  Set to 0 to disable debouncing.
 */
export function useSessionEvents(
    apiBaseUrl: string,
    sessionId: string | null | undefined,
    handlers: SessionEventHandler,
    debounceMs = 300,
) {
    // Keep handlers in a ref so we never re-open the connection just because
    // the consumer re-created its callback object.
    const handlersRef = useRef(handlers);
    handlersRef.current = handlers;

    // Track last-dispatch timestamps for debouncing
    const lastDispatch = useRef<Record<string, number>>({});

    const dispatch = useCallback(
        (eventType: string) => {
            const now = Date.now();
            const last = lastDispatch.current[eventType] || 0;
            if (now - last < debounceMs) return;
            lastDispatch.current[eventType] = now;

            const h = handlersRef.current;
            switch (eventType) {
                case 'task_state_changed':
                    h.onTaskStateChanged?.();
                    break;
                case 'session_state_changed':
                    h.onSessionStateChanged?.();
                    break;
                case 'data_store_updated':
                    h.onDataStoreUpdated?.();
                    break;
                case 'blueprint_updated':
                    h.onBlueprintUpdated?.();
                    break;
            }
        },
        [debounceMs],
    );

    useEffect(() => {
        if (!sessionId) return;

        const url = `${apiBaseUrl}/sessions/${sessionId}/events`;
        console.log(`[SSE] Connecting to ${url}`);

        const es = new EventSource(url);

        // --- typed event listeners ---
        const eventTypes: SessionEventType[] = [
            'connected',
            'task_state_changed',
            'session_state_changed',
            'data_store_updated',
            'blueprint_updated',
        ];

        for (const eventType of eventTypes) {
            es.addEventListener(eventType, () => {
                if (eventType === 'connected') {
                    console.log('[SSE] Connected to session event stream');
                    return;
                }
                dispatch(eventType);
            });
        }

        es.onerror = (err) => {
            console.warn('[SSE] Connection error, will retry automatically', err);
        };

        return () => {
            console.log('[SSE] Closing connection');
            es.close();
        };
    }, [apiBaseUrl, sessionId, dispatch]);
}

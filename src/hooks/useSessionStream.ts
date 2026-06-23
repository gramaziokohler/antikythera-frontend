import { useState, useEffect, useRef, useCallback } from 'react'
import type { GraphData } from '../types'
import { transformBlueprintToGraph } from '../utils/transform-blueprint'

const DEFAULT_RECONNECT_DELAY_MS = 2000

export interface UseSessionStreamOptions {
  reconnectDelay?: number
  onDatastoreUpdate?: (blueprintId: string, data: Record<string, unknown>) => void
}

export interface UseSessionStreamResult {
  graphData: GraphData | null
  sessionState: string
  reconnect: () => void
}

export function useSessionStream(
  sessionId: string | null | undefined,
  apiBaseUrl: string,
  visibleBlueprintId: string | null | undefined,
  { reconnectDelay = DEFAULT_RECONNECT_DELAY_MS, onDatastoreUpdate }: UseSessionStreamOptions = {}
): UseSessionStreamResult {
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [sessionState, setSessionState] = useState<string>('pending')
  const [reconnectKey, setReconnectKey] = useState(0)

  const visibleBlueprintIdRef = useRef(visibleBlueprintId)
  useEffect(() => {
    visibleBlueprintIdRef.current = visibleBlueprintId
  }, [visibleBlueprintId])

  const reconnect = useCallback(() => {
    setReconnectKey(k => k + 1)
  }, [])

  useEffect(() => {
    if (!sessionId) return

    let cancelled = false
    let es: EventSource | null = null
    let timer: ReturnType<typeof setTimeout> | null = null

    const closeAll = () => {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      if (es) {
        es.close()
        es = null
      }
    }

    const connect = async () => {
      closeAll()

      try {
        const [bpRes, sessRes] = await Promise.all([
          fetch(`${apiBaseUrl}/sessions/${sessionId}/blueprint`),
          fetch(`${apiBaseUrl}/sessions/${sessionId}`),
        ])

        if (cancelled) return

        if (bpRes.ok) {
          const blueprint = await bpRes.json()
          if (!cancelled) setGraphData(transformBlueprintToGraph(blueprint))
        }

        if (sessRes.ok) {
          const sessDetails = await sessRes.json()
          if (!cancelled) {
            setSessionState(sessDetails.data?.state || sessDetails.state || 'pending')
          }
        }

        if (onDatastoreUpdate) {
          const dataRes = await fetch(`${apiBaseUrl}/sessions/${sessionId}/data`)
          if (dataRes.ok && !cancelled) {
            const sessionData = await dataRes.json()
            onDatastoreUpdate('__snapshot__', sessionData)
          }
        }
      } catch (err) {
        console.error('[useSessionStream] snapshot fetch failed', err)
        if (!cancelled) scheduleReconnect()
        return
      }

      if (cancelled) return

      es = new EventSource(`${apiBaseUrl}/sessions/${sessionId}/stream`)

      es.addEventListener('task_state_changed', (event: MessageEvent) => {
        try {
          const payload = JSON.parse(event.data) as { blueprint_id: string; task_id: string; state: string }
          if (payload.blueprint_id !== visibleBlueprintIdRef.current) return
          setGraphData(prev => {
            if (!prev) return prev
            return {
              ...prev,
              nodes: prev.nodes.map(node =>
                node.id === payload.task_id ? { ...node, status: payload.state } : node
              ),
            }
          })
        } catch (e) {
          console.error('[useSessionStream] failed to parse task_state_changed', e)
        }
      })

      es.addEventListener('session_state_changed', (event: MessageEvent) => {
        try {
          const payload = JSON.parse(event.data) as { state: string }
          setSessionState(payload.state)
        } catch (e) {
          console.error('[useSessionStream] failed to parse session_state_changed', e)
        }
      })

      es.addEventListener('datastore_updated', (event: MessageEvent) => {
        try {
          const payload = JSON.parse(event.data) as {
            blueprint_id: string
            data: Record<string, unknown>
          }
          onDatastoreUpdate?.(payload.blueprint_id, payload.data)
        } catch (e) {
          console.error('[useSessionStream] failed to parse datastore_updated', e)
        }
      })

      es.onerror = () => {
        if (cancelled) return
        closeAll()
        scheduleReconnect()
      }
    }

    const scheduleReconnect = () => {
      timer = setTimeout(() => {
        if (!cancelled) setReconnectKey(k => k + 1)
      }, reconnectDelay)
    }

    connect()

    return () => {
      cancelled = true
      closeAll()
    }
  }, [sessionId, apiBaseUrl, reconnectKey, reconnectDelay, onDatastoreUpdate])

  return { graphData, sessionState, reconnect }
}

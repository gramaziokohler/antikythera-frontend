import { useState, useEffect, useMemo } from 'react'
import type { SessionDataResponse, GraphData } from '../types'
import { SessionGraph } from './SessionGraph'

interface SessionMonitorProps {
  apiBaseUrl: string
  sessionId?: string | null
  blueprintId?: string | null
  onClose: () => void
}

const DataViewer = ({ data }: { data: any }) => {
  if (data === null || data === undefined) return <span className="text-gray-500">null</span>
  
  if (typeof data !== 'object') {
    return <span>{String(data)}</span>
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="text-gray-500">[]</span>
    return (
      <div className="data-array">
        {data.map((item, index) => (
          <div key={index} className="data-array-item">
            <span className="index-label">[{index}]</span>
            <div className="array-value">
              <DataViewer data={item} />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (Object.keys(data).length === 0) return <span className="text-gray-500">{"{}"}</span>

  return (
    <table className="data-table">
      <tbody>
        {Object.entries(data).map(([key, value]) => (
          <tr key={key}>
            <td className="data-key">{key}</td>
            <td className="data-value">
              <DataViewer data={value} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function SessionMonitor({ apiBaseUrl, sessionId, blueprintId, onClose }: SessionMonitorProps) {
  const [sessionData, setSessionData] = useState<SessionDataResponse | null>(null)
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [sessionState, setSessionState] = useState<string>('pending')
  const [error, setError] = useState<string | null>(null)

  const parsedSessionData = useMemo(() => {
    if (!sessionData?.data) return null
    try {
      // If it's already an object, return it. If it's a string, parse it.
      return typeof sessionData.data === 'string' ? JSON.parse(sessionData.data) : sessionData.data
    } catch (e) {
      console.error('Failed to parse session data', e)
      return sessionData.data
    }
  }, [sessionData])

  useEffect(() => {
    const transformBlueprintToGraph = (blueprint: any) => {
      const blueprintData = blueprint.data;
      const tasks = blueprintData.tasks;
      const nodes = tasks.map((taskWrapper: any) => {
        let details = '';
        const params = taskWrapper.data.params;
        if (params && params.blueprint) {
          if (params.blueprint.dynamic?.element?.element_id) {
            details = params.blueprint.dynamic.element.element_id;
          } else if (params.blueprint.static) {
            details = params.blueprint.static;
          }
        }

        return {
          id: taskWrapper.data.id,
          label: taskWrapper.data.id,
          status: taskWrapper.data.state || 'pending',
          details
        };
      })

      const edges = tasks.flatMap((taskWrapper: any) => 
        taskWrapper.data.depends_on.map((dep: any) => ({
          source: dep.data.id,
          target: taskWrapper.data.id
        }))
      )

      setGraphData({ nodes, edges })
    }

    // If we only have a blueprint ID, fetch just the blueprint structure
    if (!sessionId && blueprintId) {
      const fetchBlueprint = async () => {
        try {
          const response = await fetch(`${apiBaseUrl}/blueprints/${blueprintId}`)
          if (response.ok) {
            const blueprint = await response.json()
            transformBlueprintToGraph(blueprint)
            setSessionState('preview')
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to fetch blueprint')
        }
      }
      fetchBlueprint()
      return
    }

    if (!sessionId) return

    // Poll endpoints
    const fetchData = async () => {
      try {
        const [dataResponse, sessionResponse] = await Promise.all([
          fetch(`${apiBaseUrl}/sessions/${sessionId}/data`),
          fetch(`${apiBaseUrl}/sessions/${sessionId}`)
        ])

        if (dataResponse.ok) {
          // used for viewing the data store
          const data: SessionDataResponse = await dataResponse.json()
          setSessionData(data)
        }

        if (sessionResponse.ok) {
          // used to follow the execution state. 
          const sessionDetails: any = await sessionResponse.json()
          setSessionState(sessionDetails.state)  // overall session state
          
          // actual execution graph is updated in the Blueprint associated with the session, it needs to be fetched separately
          const blueprintResponse = await fetch(`${apiBaseUrl}/sessions/${sessionId}/blueprint`)
          if (blueprintResponse.ok) {
            const blueprint = await blueprintResponse.json()
            transformBlueprintToGraph(blueprint)
        }

        // Stop polling if session has ended
        if (sessionDetails.state && (
            sessionDetails.state.toLowerCase() === 'completed' || 
            sessionDetails.state.toLowerCase() === 'failed')) {
          return true // Signal to stop polling
        }
      }
        
        return false // Continue polling
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch session data')
        return false
      }
    }

    fetchData()
    const interval = setInterval(async () => {
      const shouldStop = await fetchData()
      if (shouldStop) {
        clearInterval(interval)
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [apiBaseUrl, sessionId, blueprintId])

  const handlePause = async () => {
    if (!sessionId) return
    try {
      const response = await fetch(`${apiBaseUrl}/sessions/${sessionId}/pause`, {
        method: 'POST'
      })
      if (!response.ok) throw new Error('Failed to pause session')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pause session')
    }
  }

  const handleResume = async () => {
    if (!sessionId) return
    try {
      const response = await fetch(`${apiBaseUrl}/sessions/${sessionId}/start`, {
        method: 'POST'
      })
      if (!response.ok) throw new Error('Failed to resume session')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resume session')
    }
  }

  return (
    <div className="session-monitor">
      <div className="session-monitor-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h2>{sessionId ? `Session Monitor: ${sessionId}` : `Blueprint Preview: ${blueprintId}`}</h2>
          {sessionId && (
            <div className="session-controls">
              <button onClick={handlePause} className="control-button" title="Pause Session">⏸</button>
              <button onClick={handleResume} className="control-button" title="Resume Session">▶</button>
            </div>
          )}
        </div>
        <button onClick={onClose} className="close-button">×</button>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="monitor-grid">
        {/* Diagram Section */}
        <div className="monitor-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3>Blueprint Execution Graph</h3>
          </div>
          
          <div className="diagram-info">
            <span className="state-badge">{sessionState}</span>
          </div>
          
          <div className="diagram-container" style={{ minHeight: '400px', display: 'flex', flexDirection: 'column' }}>
            {graphData ? (
              <SessionGraph data={graphData} />
            ) : (
              <div className="loading-container">
                <div className="loading-spinner"></div>
                <p>Loading graph...</p>
              </div>
            )}
          </div>
        </div>

        {/* Data Store Section */}
        <div className="monitor-section">
          <h3>Data Store</h3>
          {sessionData && (
            <div className="data-info">
              <span className="state-badge">{sessionData.state}</span>
            </div>
          )}
          <div className="data-container">
            {sessionData ? (
              <div className="data-viewer-wrapper">
                <DataViewer data={parsedSessionData} />
              </div>
            ) : (
              <div className="loading-container">
                <div className="loading-spinner"></div>
                <p>Loading data...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

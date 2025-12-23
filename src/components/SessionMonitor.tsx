import { useState, useEffect, useMemo } from 'react'
import type { SessionDataResponse, GraphData } from '../types'
import { SessionGraph } from './SessionGraph'

interface SessionMonitorProps {
  apiBaseUrl: string
  sessionId?: string | null
  blueprintId?: string | null
  onClose: () => void
}

const ValueRenderer = ({ value }: { value: any }) => {
  if (value === null || value === undefined) return <span className="text-gray-500">null</span>
  if (typeof value !== 'object') return <span>{String(value)}</span>
  return <pre className="json-value" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(value, null, 2)}</pre>
}

const DataViewer = ({ data, mainBlueprintId }: { data: any, mainBlueprintId: string }) => {
  if (!data) return <div className="text-gray-500">No data available</div>

  const rows: { blueprintId: string, key: string, value: any }[] = []

  // Process main blueprint
  if (data.main_blueprint) {
    Object.entries(data.main_blueprint).forEach(([key, value]) => {
      rows.push({ blueprintId: mainBlueprintId, key, value })
    })
  }

  // Process inner blueprints
  if (data.inner_blueprints) {
    Object.entries(data.inner_blueprints).forEach(([bpId, bpData]: [string, any]) => {
      Object.entries(bpData).forEach(([key, value]) => {
        rows.push({ blueprintId: bpId, key, value })
      })
    })
  }

  if (rows.length === 0) return <div className="text-gray-500">No data entries</div>

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th style={{ textAlign: 'left', padding: '8px', background: '#f5f7fa', borderBottom: '2px solid #e0e0e0' }}>Blueprint ID</th>
          <th style={{ textAlign: 'left', padding: '8px', background: '#f5f7fa', borderBottom: '2px solid #e0e0e0' }}>Key</th>
          <th style={{ textAlign: 'left', padding: '8px', background: '#f5f7fa', borderBottom: '2px solid #e0e0e0' }}>Value</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            <td className="data-key" style={{ width: 'auto' }}>{row.blueprintId}</td>
            <td className="data-key" style={{ width: 'auto' }}>{row.key}</td>
            <td className="data-value">
              <ValueRenderer value={row.value} />
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
  const [mainBlueprintId, setMainBlueprintId] = useState<string>('Main Blueprint')
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

          // Handle COMPAS Data object structure
          const state = sessionDetails.data?.state || sessionDetails.state || 'pending'
          setSessionState(state)

          // Extract main blueprint ID
          const bpId = sessionDetails.data?.blueprint?.data?.id || sessionDetails.blueprint?.id || 'Main Blueprint'
          setMainBlueprintId(bpId)

          // actual execution graph is updated in the Blueprint associated with the session, it needs to be fetched separately
          const blueprintResponse = await fetch(`${apiBaseUrl}/sessions/${sessionId}/blueprint`)
          if (blueprintResponse.ok) {
            const blueprint = await blueprintResponse.json()
            transformBlueprintToGraph(blueprint)
          }

          // Stop polling if session has ended
          if (state && (
            state.toLowerCase() === 'completed' ||
            state.toLowerCase() === 'failed')) {
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

  const handleDownloadData = () => {
    if (!sessionData) return

    const recursivelyParseJson = (obj: any): any => {
      if (typeof obj === 'string') {
        try {
          const parsed = JSON.parse(obj)
          if (typeof parsed === 'object' && parsed !== null) {
            return recursivelyParseJson(parsed)
          }
        } catch (e) {
          // Not valid JSON or not an object/array, return original string
        }
        return obj
      } else if (Array.isArray(obj)) {
        return obj.map(recursivelyParseJson)
      } else if (typeof obj === 'object' && obj !== null) {
        const newObj: any = {}
        for (const key in obj) {
          newObj[key] = recursivelyParseJson(obj[key])
        }
        return newObj
      }
      return obj
    }
    
    const processedData = recursivelyParseJson(sessionData)
    const dataStr = JSON.stringify(processedData, null, 2)
    const blob = new Blob([dataStr], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `session-${sessionId || 'data'}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
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
          <div className="data-store-header">
            <h3>Data Store</h3>
            <button className="download-data-btn" onClick={handleDownloadData} title="Download Data Store">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
            </button>
          </div>
          <div className="data-container">
            {sessionData ? (
              <div className="data-viewer-wrapper">
                <DataViewer data={parsedSessionData} mainBlueprintId={mainBlueprintId} />
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

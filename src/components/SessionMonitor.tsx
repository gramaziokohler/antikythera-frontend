import { useState, useEffect } from 'react'
import type { SessionDataResponse, GraphData } from '../types'
import { SessionGraph } from './SessionGraph'

interface SessionMonitorProps {
  apiBaseUrl: string
  sessionId: string
  onClose: () => void
}

export function SessionMonitor({ apiBaseUrl, sessionId, onClose }: SessionMonitorProps) {
  const [sessionData, setSessionData] = useState<SessionDataResponse | null>(null)
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [sessionState, setSessionState] = useState<string>('pending')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Poll endpoints
    const fetchData = async () => {
      try {
        const [dataResponse, sessionResponse] = await Promise.all([
          fetch(`${apiBaseUrl}/sessions/${sessionId}/data`),
          fetch(`${apiBaseUrl}/sessions/${sessionId}`)
        ])

        if (dataResponse.ok) {
          // used for viewing the data store
          // TODO: make this prettier than just dump of JSON, make a table or something
          const data: SessionDataResponse = await dataResponse.json()
          setSessionData(data)
        }

        if (sessionResponse.ok) {
          // used to follow the execution state. 
          const sessionDetails: any = await sessionResponse.json()
          setSessionState(sessionDetails.state)  // overall session state
          
          // actual execution graph is updated in the Blueprint associated with the session, it needs to be fetched separately
          const bpId = sessionDetails.data.blueprint.data.id  
          if (bpId) {
            const blueprintResponse = await fetch(`${apiBaseUrl}/blueprints/${bpId}`)
            if (blueprintResponse.ok) {
              const blueprint = await blueprintResponse.json()
              
            // Transform to GraphData
            const blueprintData = blueprint.data;
            const tasks = blueprintData.tasks;
            console.log(`taskWrapper: ${JSON.stringify(tasks[0])}`);
            const nodes = tasks.map((taskWrapper: any) => ({
              id: taskWrapper.data.id,
              label: taskWrapper.data.id,
              status: taskWrapper.data.state
            }))

            const edges = tasks.flatMap((taskWrapper: any) => 
              taskWrapper.data.depends_on.map((dep: any) => ({
                source: dep.data.id,
                target: taskWrapper.data.id
              }))
            )

            setGraphData({ nodes, edges })
          }
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
  }, [apiBaseUrl, sessionId])

  return (
    <div className="session-monitor">
      <div className="session-monitor-header">
        <h2>Session Monitor: {sessionId}</h2>
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
              <p className="loading">Loading graph...</p>
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
              <pre className="data-content">{sessionData.data}</pre>
            ) : (
              <p className="loading">Loading data...</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

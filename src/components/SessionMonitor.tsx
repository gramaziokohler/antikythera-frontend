import { useState, useEffect, useRef } from 'react'
import mermaid from 'mermaid'
import type { BlueprintDiagramResponse, SessionDataResponse, GraphData, SessionDetailsResponse } from '../types'
import { SessionGraph } from './SessionGraph'

interface SessionMonitorProps {
  apiBaseUrl: string
  sessionId: string
  onClose: () => void
}

export function SessionMonitor({ apiBaseUrl, sessionId, onClose }: SessionMonitorProps) {
  const [diagram, setDiagram] = useState<BlueprintDiagramResponse | null>(null)
  const [sessionData, setSessionData] = useState<SessionDataResponse | null>(null)
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'mermaid' | 'graph'>('mermaid')
  const mermaidRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Initialize mermaid
    mermaid.initialize({ 
      startOnLoad: false,
      theme: 'base',
      themeVariables: {
        primaryColor: '#D81E5B',
        primaryTextColor: '#fff',
        primaryBorderColor: '#23395B',
        lineColor: '#23395B',
        secondaryColor: '#23395B',
        tertiaryColor: '#f8f9fb',
      },
      gantt: {
        titleTopMargin: 25,
        barHeight: 40,
        barGap: 8,
        topPadding: 50,
        gridLineStartPadding: 35,
        fontSize: 24,
        sectionFontSize: 24,
        numberSectionStyles: 4,
      }
    })

    // Poll endpoints
    const fetchData = async () => {
      try {
        const [diagramResponse, dataResponse, detailsResponse] = await Promise.all([
          fetch(`${apiBaseUrl}/sessions/${sessionId}/diagram`),
          fetch(`${apiBaseUrl}/sessions/${sessionId}/data`),
          fetch(`${apiBaseUrl}/sessions/${sessionId}`)
        ])

        if (diagramResponse.ok) {
          const diagramData: BlueprintDiagramResponse = await diagramResponse.json()
          setDiagram(diagramData)
          
          // Stop polling if session has ended
          if (diagramData.state.toLowerCase() === 'completed' || 
              diagramData.state.toLowerCase() === 'failed') {
            return true // Signal to stop polling
          }
        }

        if (dataResponse.ok) {
          const data: SessionDataResponse = await dataResponse.json()
          setSessionData(data)
        }

        if (detailsResponse.ok) {
          const details: SessionDetailsResponse = await detailsResponse.json()
          
          // Transform to GraphData
          const nodes = details.blueprint.tasks.map(task => ({
            id: task.id,
            label: task.name,
            status: task.status
          }))

          const edges = details.blueprint.tasks.flatMap(task => 
            task.dependencies.map(depId => ({
              source: depId,
              target: task.id
            }))
          )

          setGraphData({ nodes, edges })
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

  useEffect(() => {
    // Render mermaid diagram when it changes or view mode switches back
    if (diagram && mermaidRef.current && viewMode === 'mermaid') {
      const renderDiagram = async () => {
        try {
          const id = `mermaid-${Date.now()}`
          const { svg } = await mermaid.render(id, diagram.diagram)
          if (mermaidRef.current) {
            mermaidRef.current.innerHTML = svg
          }
        } catch (err) {
          console.error('Failed to render mermaid diagram:', err)
        }
      }
      renderDiagram()
    }
  }, [diagram, viewMode])

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
            <h3>Blueprint Diagram</h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button 
                onClick={() => setViewMode('mermaid')}
                style={{ 
                  padding: '0.25rem 0.5rem', 
                  fontSize: '0.8rem',
                  background: viewMode === 'mermaid' ? '#23395B' : '#f0f0f0',
                  color: viewMode === 'mermaid' ? 'white' : '#333'
                }}
              >
                Gantt
              </button>
              <button 
                onClick={() => setViewMode('graph')}
                style={{ 
                  padding: '0.25rem 0.5rem', 
                  fontSize: '0.8rem',
                  background: viewMode === 'graph' ? '#23395B' : '#f0f0f0',
                  color: viewMode === 'graph' ? 'white' : '#333'
                }}
              >
                Graph (React Flow)
              </button>
            </div>
          </div>
          
          {diagram && (
            <div className="diagram-info">
              <span className="state-badge">{diagram.state}</span>
            </div>
          )}
          
          <div className="diagram-container" style={{ minHeight: '400px', display: 'flex', flexDirection: 'column' }}>
            {viewMode === 'mermaid' ? (
              <>
                <div ref={mermaidRef} style={{ flex: 1 }}></div>
                {!diagram && <p className="loading">Loading diagram...</p>}
              </>
            ) : (
              graphData ? (
                <SessionGraph data={graphData} />
              ) : (
                <p className="loading">Loading graph...</p>
              )
            )}
          </div>
          
          {diagram && viewMode === 'mermaid' && (
            <details className="diagram-source">
              <summary>View Mermaid Source</summary>
              <pre className="data-content">{diagram.diagram}</pre>
            </details>
          )}
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

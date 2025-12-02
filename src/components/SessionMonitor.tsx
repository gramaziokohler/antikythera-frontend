import { useState, useEffect, useRef } from 'react'
import mermaid from 'mermaid'
import type { BlueprintDiagramResponse, SessionDataResponse } from '../types'

interface SessionMonitorProps {
  apiBaseUrl: string
  sessionId: string
  onClose: () => void
}

export function SessionMonitor({ apiBaseUrl, sessionId, onClose }: SessionMonitorProps) {
  const [diagram, setDiagram] = useState<BlueprintDiagramResponse | null>(null)
  const [sessionData, setSessionData] = useState<SessionDataResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
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

    // Poll both endpoints every 2 seconds
    const fetchData = async () => {
      try {
        const [diagramResponse, dataResponse] = await Promise.all([
          fetch(`${apiBaseUrl}/sessions/${sessionId}/diagram`),
          fetch(`${apiBaseUrl}/sessions/${sessionId}/data`)
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
          
          // Stop polling if session has ended
          if (data.state.toLowerCase() === 'completed' || 
              data.state.toLowerCase() === 'failed') {
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

  useEffect(() => {
    // Render mermaid diagram when it changes
    if (diagram && mermaidRef.current) {
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
  }, [diagram])

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
          <h3>Blueprint Diagram</h3>
          {diagram && (
            <div className="diagram-info">
              <span className="state-badge">{diagram.state}</span>
            </div>
          )}
          <div className="diagram-container" ref={mermaidRef}>
            {!diagram && <p className="loading">Loading diagram...</p>}
          </div>
          {diagram && (
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

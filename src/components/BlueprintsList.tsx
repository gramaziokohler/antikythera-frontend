import { useState, useEffect } from 'react'
import type { BlueprintInfo, DeleteBlueprintResponse } from '../types'
import { StartSessionDialog } from './StartSessionDialog'

interface BlueprintsListProps {
  apiBaseUrl: string
  onSessionStart: (sessionId: string) => void
  onBlueprintSelect?: (blueprintId: string) => void
  lastUpdate?: number
}

export function BlueprintsList({ apiBaseUrl, onSessionStart, onBlueprintSelect, lastUpdate }: BlueprintsListProps) {
  const [blueprints, setBlueprints] = useState<BlueprintInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [startMessage, setStartMessage] = useState<string>('')
  const [deleteMessage, setDeleteMessage] = useState<string>('')
  const [expandedBlueprintId, setExpandedBlueprintId] = useState<string | null>(null)
  const [showStartDialog, setShowStartDialog] = useState(false)
  const [selectedBlueprintForStart, setSelectedBlueprintForStart] = useState<BlueprintInfo | null>(null)

  useEffect(() => {
    fetchBlueprints()
  }, [lastUpdate])

  const fetchBlueprints = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${apiBaseUrl}/blueprints`)
      if (!response.ok) throw new Error('Failed to fetch blueprints')
      const data: BlueprintInfo[] = await response.json()
      setBlueprints(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const initiateStart = (blueprint: BlueprintInfo) => {
    setSelectedBlueprintForStart(blueprint)
    setShowStartDialog(true)
    setStartMessage('')
  }

  const handleSessionStarted = (sessionId: string) => {
    setStartMessage(`Session started: ${sessionId}`)
    setShowStartDialog(false)
    onSessionStart(sessionId)
  }

  const handleDelete = async (blueprintId: string) => {
    setDeleteMessage('')
    setStartMessage('')

    try {
      const response = await fetch(`${apiBaseUrl}/blueprints/${blueprintId}`, {
        method: 'DELETE',
      })

      if (!response.ok) throw new Error('Failed to delete blueprint')

      const data: DeleteBlueprintResponse = await response.json()
      setDeleteMessage(data.message)

      // Refresh the list
      fetchBlueprints()
    } catch (err) {
      setDeleteMessage(err instanceof Error ? err.message : 'Failed to delete blueprint')
    }
  }

  const handleDownload = async (blueprintId: string, name: string) => {
    try {
      const response = await fetch(`${apiBaseUrl}/blueprints/${blueprintId}`)
      if (!response.ok) throw new Error('Failed to download blueprint')

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${name}.json`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to download blueprint')
    }
  }

  return (
    <section className="blueprints-section">
      <h2>Available Blueprints</h2>
      <button onClick={fetchBlueprints} disabled={loading}>
        {loading ? 'Loading...' : 'Refresh'}
      </button>

      {error && <p className="error">{error}</p>}

      {blueprints.length === 0 && !loading && !error && (
        <p>No blueprints available</p>
      )}

      <div className="blueprints-list">
        {blueprints.map((blueprint) => {
          const isExpanded = expandedBlueprintId === blueprint.id
          return (
            <div key={blueprint.id} className={`blueprint-card ${isExpanded ? 'expanded' : 'compact'}`}>
              <div
                className="blueprint-header-row"
                onClick={() => {
                  if (isExpanded) {
                    setExpandedBlueprintId(null)
                  } else {
                    setExpandedBlueprintId(blueprint.id)
                    onBlueprintSelect?.(blueprint.id)
                  }
                }}
                title={isExpanded ? "Click to collapse" : "Click to expand"}
              >
                <h3>{blueprint.name} <span className="version-tag">v{blueprint.version}</span></h3>
                <span className="expand-icon">{isExpanded ? '−' : '+'}</span>
              </div>

              {isExpanded && (
                <div className="blueprint-details-container">
                  <p className="description">{blueprint.description || 'N/A'}</p>
                  <div className="meta-row">
                    <span><strong>Tasks:</strong> {blueprint.task_count}</span>
                    <span><strong>Uploaded:</strong> {new Date(blueprint.uploaded_at).toLocaleDateString()}</span>
                  </div>

                  <div className="blueprint-actions">
                    <button
                      className="start-button"
                      onClick={() => initiateStart(blueprint)}
                    >
                      Start
                    </button>
                    <button
                      className="download-button"
                      onClick={() => handleDownload(blueprint.id, blueprint.name)}
                      title="Download Blueprint"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                    </button>
                    <button
                      className="delete-button"
                      onClick={() => handleDelete(blueprint.id)}
                      title="Delete Blueprint"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {startMessage && <p className="message">{startMessage}</p>}
      {deleteMessage && <p className="message">{deleteMessage}</p>}

      {showStartDialog && selectedBlueprintForStart && (
        <StartSessionDialog
          apiBaseUrl={apiBaseUrl}
          blueprintId={selectedBlueprintForStart.id}
          blueprintName={selectedBlueprintForStart.name}
          onSessionStarted={handleSessionStarted}
          onCancel={() => setShowStartDialog(false)}
        />
      )}

    </section>
  )
}

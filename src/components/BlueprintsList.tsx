import { useState, useEffect } from 'react'
import type { BlueprintInfo, StartBlueprintResponse, DeleteBlueprintResponse } from '../types'

interface BlueprintsListProps {
  apiBaseUrl: string
  onSessionStart: (sessionId: string) => void
}

export function BlueprintsList({ apiBaseUrl, onSessionStart }: BlueprintsListProps) {
  const [blueprints, setBlueprints] = useState<BlueprintInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [startMessage, setStartMessage] = useState<string>('')
  const [deleteMessage, setDeleteMessage] = useState<string>('')

  useEffect(() => {
    fetchBlueprints()
  }, [])

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

  const handleStart = async (blueprintId: string) => {
    setStartMessage('')
    setDeleteMessage('')
    try {
      const response = await fetch(`${apiBaseUrl}/blueprints/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          blueprint_id: blueprintId,
          broker_host: '127.0.0.1',
          broker_port: 1883,
        }),
      })
      
      if (!response.ok) throw new Error('Failed to start blueprint')
      
      const data: StartBlueprintResponse = await response.json()
      setStartMessage(`${data.message}`)
      onSessionStart(data.session_id)
    } catch (err) {
      setStartMessage(err instanceof Error ? err.message : 'Failed to start blueprint')
    }
  }

  const handleDelete = async (blueprintId: string) => {
    setDeleteMessage('')
    setStartMessage('')
    if (!confirm('Are you sure you want to delete this blueprint?')) {
      return
    }
    
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
        {blueprints.map((blueprint) => (
          <div key={blueprint.id} className="blueprint-card">
            <h3>{blueprint.name} (v{blueprint.version})</h3>
            <p>{blueprint.description || 'N/A'}</p>
            <p><strong>Task count:</strong> {blueprint.task_count}</p>
            <p><strong>Uploaded:</strong> {new Date(blueprint.uploaded_at).toLocaleString()}</p>
            <div className="blueprint-actions">
              <button 
                className="start-button"
                onClick={() => handleStart(blueprint.id)}
              >
                Start Blueprint
              </button>
              <button 
                className="delete-button"
                onClick={() => handleDelete(blueprint.id)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
      
      {startMessage && <p className="message">{startMessage}</p>}
      {deleteMessage && <p className="message">{deleteMessage}</p>}
    </section>
  )
}

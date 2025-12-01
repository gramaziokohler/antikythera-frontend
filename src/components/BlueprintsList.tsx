import { useState, useEffect } from 'react'
import type { BlueprintInfo, StartBlueprintResponse } from '../types'

interface BlueprintsListProps {
  apiBaseUrl: string
}

export function BlueprintsList({ apiBaseUrl }: BlueprintsListProps) {
  const [blueprints, setBlueprints] = useState<BlueprintInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [startMessage, setStartMessage] = useState<string>('')

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
      setStartMessage(`${data.message} (Session: ${data.session_id})`)
    } catch (err) {
      setStartMessage(err instanceof Error ? err.message : 'Failed to start blueprint')
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
            <h3>{blueprint.name}</h3>
            <p><strong>Version:</strong> {blueprint.version}</p>
            <p><strong>Description:</strong> {blueprint.description || 'N/A'}</p>
            <p><strong>Tasks:</strong> {blueprint.task_count}</p>
            <p><strong>Uploaded:</strong> {new Date(blueprint.uploaded_at).toLocaleString()}</p>
            <button 
              className="start-button"
              onClick={() => handleStart(blueprint.id)}
            >
              Start Blueprint
            </button>
          </div>
        ))}
      </div>
      
      {startMessage && <p className="message">{startMessage}</p>}
    </section>
  )
}

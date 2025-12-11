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
  const [blueprintParams, setBlueprintParams] = useState<Record<string, Array<{ key: string, value: string }>>>({})

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

    const paramsList = blueprintParams[blueprintId] || []
    const params: Record<string, string> = {}
    
    for (const p of paramsList) {
      if (p.key.trim()) {
        params[p.key.trim()] = p.value
      }
    }

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
          params: Object.keys(params).length > 0 ? params : undefined,
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

  const addParam = (blueprintId: string) => {
    setBlueprintParams(prev => ({
      ...prev,
      [blueprintId]: [...(prev[blueprintId] || []), { key: '', value: '' }]
    }))
  }

  const updateParam = (blueprintId: string, index: number, field: 'key' | 'value', value: string) => {
    setBlueprintParams(prev => {
      const currentParams = [...(prev[blueprintId] || [])]
      currentParams[index] = { ...currentParams[index], [field]: value }
      return { ...prev, [blueprintId]: currentParams }
    })
  }

  const removeParam = (blueprintId: string, index: number) => {
    setBlueprintParams(prev => {
      const currentParams = [...(prev[blueprintId] || [])]
      currentParams.splice(index, 1)
      return { ...prev, [blueprintId]: currentParams }
    })
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
            
            <div className="blueprint-params">
              <details>
                <summary>Parameters</summary>
                <div className="params-list">
                  {(blueprintParams[blueprint.id] || []).map((param, index) => (
                    <div key={index} className="param-row">
                      <input
                        type="text"
                        placeholder="Key"
                        value={param.key}
                        onChange={(e) => updateParam(blueprint.id, index, 'key', e.target.value)}
                        className="param-input"
                      />
                      <input
                        type="text"
                        placeholder="Value"
                        value={param.value}
                        onChange={(e) => updateParam(blueprint.id, index, 'value', e.target.value)}
                        className="param-input"
                      />
                      <button
                        onClick={() => removeParam(blueprint.id, index)}
                        className="remove-param-btn"
                        title="Remove parameter"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => addParam(blueprint.id)}
                    className="add-param-btn"
                  >
                    + Add Parameter
                  </button>
                </div>
              </details>
            </div>

            <div className="blueprint-actions">
              <button 
                className="start-button"
                onClick={() => handleStart(blueprint.id)}
              >
                Start
              </button>
              <button 
                className="download-button"
                onClick={() => handleDownload(blueprint.id, blueprint.name)}
                title="Download Blueprint"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              </button>
              <button 
                className="delete-button"
                onClick={() => handleDelete(blueprint.id)}
                title="Delete Blueprint"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
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

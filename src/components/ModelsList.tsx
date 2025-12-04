import { useState, useEffect } from 'react'
import type { DeleteModelResponse } from '../types'

interface ModelsListProps {
  apiBaseUrl: string
}

export function ModelsList({ apiBaseUrl }: ModelsListProps) {
  const [models, setModels] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchModels = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${apiBaseUrl}/models`)
      if (!response.ok) throw new Error('Failed to fetch models')
      const data: string[] = await response.json()
      setModels(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch models')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (modelId: string) => {
    if (!confirm(`Are you sure you want to delete model "${modelId}"?`)) return

    try {
      const response = await fetch(`${apiBaseUrl}/models/${modelId}`, {
        method: 'DELETE',
      })
      
      if (!response.ok) throw new Error('Failed to delete model')
      
      const data: DeleteModelResponse = await response.json()
      console.log(data.message)
      fetchModels() // Refresh list
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete model')
    }
  }

  useEffect(() => {
    fetchModels()
  }, [apiBaseUrl])

  return (
    <div className="models-list-container">
      <div className="list-header">
        <h3>Available Models</h3>
        <button onClick={fetchModels} className="refresh-button" title="Refresh list">
          ↻
        </button>
      </div>

      {loading && <div className="loading">Loading models...</div>}
      {error && <div className="error">{error}</div>}
      
      {!loading && !error && models.length === 0 && (
        <div className="empty-state">No models found</div>
      )}

      <ul className="models-list">
        {models.map((modelId) => (
          <li key={modelId} className="model-item">
            <span className="model-id">{modelId}</span>
            <button 
              onClick={() => handleDelete(modelId)}
              className="delete-button"
              title="Delete model"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

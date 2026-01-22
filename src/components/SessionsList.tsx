import { useState, useEffect } from 'react'
import type { SessionInfo } from '../types'

interface SessionsListProps {
  apiBaseUrl: string
  onSessionSelect: (sessionId: string) => void
}

export function SessionsList({ apiBaseUrl, onSessionSelect }: SessionsListProps) {
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchSessions = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${apiBaseUrl}/sessions`)
      if (!response.ok) throw new Error('Failed to fetch sessions')
      const data: SessionInfo[] = await response.json()
      // Sort by started_at descending (newest first)
      const sortedData = data.sort((a, b) => {
        const timeA = a.started_at ? new Date(a.started_at).getTime() : 0
        const timeB = b.started_at ? new Date(b.started_at).getTime() : 0
        return timeB - timeA
      })
      setSessions(sortedData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
     fetchSessions()
  }, [apiBaseUrl]) 

  return (
    <div className="sessions-list-container">
      <div className="list-header">
        <h3>Available Sessions</h3>
        <button onClick={fetchSessions} disabled={loading} className="refresh-button" title="Refresh list">
        ↻
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="sessions-list">
        {sessions.length === 0 && !loading && !error && (
            <p className="no-data">No sessions found</p>
        )}
        
        {sessions.map((session) => (
          <div key={session.session_id} className="session-card" onClick={() => onSessionSelect(session.session_id)}>
            <div className="session-header">
                <span className="session-id-preview" title={session.session_id}>
                    {session.session_id.substring(0, 8)}...
                </span>
                <span className={`status-tag ${session.state.toLowerCase()}`}>{session.state}</span>
            </div>
            <div className="session-details">
                <div className="session-detail-row">
                    <span className="detail-label">Blueprint:</span>
                    <span className="detail-value" title={session.blueprint_id}>{session.blueprint_id}</span>
                </div>
                <div className="session-detail-row">
                    <span className="detail-label">Started:</span>
                    <span className="detail-value">{session.started_at ? new Date(session.started_at).toLocaleString() : 'Not started'}</span>
                </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

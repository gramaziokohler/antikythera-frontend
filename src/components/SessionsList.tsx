import { useState, useRef, useCallback } from 'react'
import type { SessionInfo } from '../types'

interface SessionsListProps {
  apiBaseUrl: string
  onSessionSelect: (sessionId: string) => void
}

export function SessionsList({ apiBaseUrl, onSessionSelect }: SessionsListProps) {
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Pagination state
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const LIMIT = 10
  const observer = useRef<IntersectionObserver | null>(null)

  // Sentinel ref approach
  const sentinelRef = useCallback((node: HTMLDivElement | null) => {
    if (loading) return
    if (observer.current) observer.current.disconnect()

    observer.current = new IntersectionObserver(entries => {
      console.log("Intersection entries:", entries);
      if (entries[0].isIntersecting && hasMore) {
        console.log("Sentinel intersecting, loading more...");
        setOffset(prevOffset => prevOffset + LIMIT)
      }
    }, {
      root: null,
      rootMargin: '200px', // Increased margin
      threshold: 0
    })

    if (node) observer.current.observe(node);
    console.log("Observer attached to sentinel");
  }, [loading, hasMore])

  const handleRefresh = () => {
    setOffset(0)
    setHasMore(true)
    setSessions([])
    setRefreshTrigger(prev => prev + 1)
  }

  // ... useEffect for fetchSessions ...

  return (
    <div className="sessions-list-container">
      <div className="list-header">
        <h3>Available Sessions</h3>
        <button onClick={handleRefresh} disabled={loading && sessions.length === 0} className="refresh-button" title="Refresh list">
          ↻
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="sessions-list">
        {sessions.length === 0 && !loading && !error && (
          <p className="no-data">No sessions found</p>
        )}

        {sessions.map((session) => (
          <div
            key={session.session_id}
            className="session-card"
            onClick={() => onSessionSelect(session.session_id)}
          >
            <div className="session-header">
              <span className="session-id-preview" title={session.blueprint_id} style={{ display: 'flex', flexDirection: 'column' }}>
                <span>{session.blueprint_id}</span>
                <span style={{ fontSize: '0.8em', color: 'var(--color-text-muted)', fontWeight: 300 }}>
                  {session.session_id.substring(0, 8)}...
                </span>
              </span>
              <span className={`status-tag ${session.state.toLowerCase()}`}>{session.state}</span>
            </div>
            <div className="session-details">
              <div className="session-detail-row">
                <span className="detail-label">Started:</span>
                <span className="detail-value">{session.started_at ? new Date(session.started_at).toLocaleString() : 'Not started'}</span>
              </div>
            </div>
          </div>
        ))}

        {/* Loading Indicator / Sentinel */}
        {loading && <div className="loading-state" style={{ textAlign: 'center', padding: '20px', color: 'var(--color-text-secondary)' }}>Loading...</div>}

        {!loading && hasMore && (
          <div ref={sentinelRef} style={{ height: '40px', width: '100%' }}>
            {/* Debug element to visualize sentinel if needed, usually transparent */}
          </div>
        )}
      </div>
    </div>
  )
}

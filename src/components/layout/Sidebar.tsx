import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  FileText,
  Box,
  Moon,
  Sun,
  Trash2
} from 'lucide-react';
import './Sidebar.css';
import type { BlueprintInfo, SessionInfo } from '../../types';
import { timeAgo } from '../../utils';

interface SidebarProps {
  apiBaseUrl: string;
  onSelectionChange: (selection: { type: 'dashboard' | 'blueprint' | 'session' | 'upload-blueprint' | 'upload-model' | 'artifacts', id?: string }) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  refreshTrigger?: number;
  activeSelection?: { type: string, id?: string };
  theme?: 'light' | 'dark';
  toggleTheme?: () => void;
}

export function Sidebar({ apiBaseUrl, onSelectionChange, collapsed, onToggleCollapse, refreshTrigger, activeSelection, theme, toggleTheme }: SidebarProps) {
  const [blueprints, setBlueprints] = useState<BlueprintInfo[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(false);

  // Pagination State
  const [sessionsOffset, setSessionsOffset] = useState(0);
  const [hasMoreSessions, setHasMoreSessions] = useState(true);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const observer = useRef<IntersectionObserver | null>(null);
  const SESSIONS_LIMIT = 10;

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    blueprints: true,
    sessions: true
  });

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const fetchBlueprints = async () => {
    try {
      const res = await fetch(`${apiBaseUrl}/blueprints`);
      if (res.ok) setBlueprints(await res.json());
    } catch (e) { console.error("Failed to fetch blueprints", e); }
  };

  const fetchSessions = async (reset = false) => {
    if (loadingSessions && !reset) return; // Allow reset even if loading? safe to block
    setLoadingSessions(true);

    const offset = reset ? 0 : sessionsOffset;

    try {
      const res = await fetch(`${apiBaseUrl}/sessions?limit=${SESSIONS_LIMIT}&offset=${offset}`);
      if (res.ok) {
        const data: SessionInfo[] = await res.json();
        const sortedData = data.sort((a, b) => {
          const timeA = a.started_at ? new Date(a.started_at).getTime() : 0;
          const timeB = b.started_at ? new Date(b.started_at).getTime() : 0;
          return timeB - timeA;
        });

        if (sortedData.length < SESSIONS_LIMIT) {
          setHasMoreSessions(false);
        } else {
          setHasMoreSessions(true); // Ensure it's true if we got a full page
        }

        if (reset) {
          setSessions(sortedData);
          setSessionsOffset(SESSIONS_LIMIT);
        } else {
          setSessions(prev => [...prev, ...sortedData]);
          setSessionsOffset(prev => prev + SESSIONS_LIMIT);
        }
      }
    } catch (error) {
      console.error("Failed to fetch sessions", error);
    } finally {
      setLoadingSessions(false);
    }
  };

  const reloadAll = () => {
    setLoading(true);
    Promise.all([fetchBlueprints(), fetchSessions(true)]).finally(() => setLoading(false));
  };

  const handleDeleteBlueprint = async (blueprintId: string, blueprintName: string) => {
    if (!window.confirm(`Delete blueprint "${blueprintName}"?`)) return;
    try {
      const res = await fetch(`${apiBaseUrl}/blueprints/${blueprintId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete blueprint');
      fetchBlueprints();
    } catch (e) {
      console.error('Failed to delete blueprint', e);
      alert(e instanceof Error ? e.message : 'Failed to delete blueprint');
    }
  };

  useEffect(() => {
    reloadAll();
  }, [apiBaseUrl, refreshTrigger]);

  const lastSessionElementRef = useCallback((node: HTMLDivElement | null) => {
    if (loadingSessions) return;
    if (observer.current) observer.current.disconnect();

    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMoreSessions) {
        console.log("Loading more sessions...");
        fetchSessions();
      }
    }, { threshold: 0.1 });

    if (node) observer.current.observe(node);
  }, [loadingSessions, hasMoreSessions]);


  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="logo-area" onClick={() => onSelectionChange({ type: 'dashboard' })} style={{ cursor: 'pointer' }}>
          <img src="/antikythera.png" alt="Antikythera" className="logo-icon" />
          {!collapsed && <span className="logo-text logo-serif">Antikythera</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {toggleTheme && (
            <button
              onClick={toggleTheme}
              className="icon-btn"
              style={{
                background: 'transparent',
                border: 'none',
                padding: '4px',
                color: 'var(--color-text-secondary)',
                opacity: 0.7
              }}
              title={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          )}
          <button
            className="collapse-btn"
            onClick={onToggleCollapse}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
      </div>

      <div className="sidebar-content">
        {/* New Item Actions */}
        <div className="sidebar-section">
          <div className="new-actions-list">
            <div
              className={`list-item new-item ${activeSelection?.type === 'upload-blueprint' ? 'active' : ''}`}
              onClick={() => onSelectionChange({ type: 'upload-blueprint' })}
              title="New Blueprint"
            >
              <div className="icon-wrapper"><Plus size={16} /></div>
              {!collapsed && <span className="item-label">New Blueprint</span>}
            </div>
            <div
              className={`list-item new-item ${activeSelection?.type === 'artifacts' ? 'active' : ''}`}
              onClick={() => onSelectionChange({ type: 'artifacts' })}
              title="Artifacts"
            >
              <div className="icon-wrapper"><Box size={16} /></div>
              {!collapsed && <span className="item-label">Artifacts</span>}
            </div>
          </div>
        </div>

        {/* Blueprints Section */}
        <div className="sidebar-section">
          <div className="section-title">
            {!collapsed && <span onClick={() => toggleSection('blueprints')}>Blueprints</span>}
            <div className="section-actions">
              <button className="icon-btn" title="Refresh" onClick={reloadAll}>
                <RefreshCw size={12} className={loading ? 'spin' : ''} />
              </button>
            </div>
          </div>

          {!collapsed && expandedSections.blueprints && (
            <div className="section-list">
              {blueprints.length === 0 ? (
                <div className="empty-state">No blueprints</div>
              ) : (
                [...blueprints]
                  .sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime())
                  .map(bp => (
                    <div
                      key={bp.id}
                      className={`list-item ${activeSelection?.type === 'blueprints' && activeSelection?.id === bp.id ? 'active' : ''}`}
                      onClick={() => onSelectionChange({ type: 'blueprint', id: bp.id })}
                      title={bp.name}
                    >
                      <span className="item-label">{bp.name}</span>
                      <span className="item-meta">v{bp.version}</span>
                      <button
                        className="item-delete-btn"
                        title="Delete blueprint"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteBlueprint(bp.id, bp.name);
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))
              )}
            </div>
          )}
        </div>

        {/* Sessions Section */}
        <div className="sidebar-section">
          <div className="section-title">
            {!collapsed && <span onClick={() => toggleSection('sessions')}>Sessions</span>}
            <div className="section-actions">
              <button className="icon-btn" title="Refresh" onClick={reloadAll}>
                <RefreshCw size={12} className={loading ? 'spin' : ''} />
              </button>
            </div>
          </div>

          {!collapsed && expandedSections.sessions && (
            <div className="section-list">
              {sessions.length === 0 && !loadingSessions ? (
                <div className="empty-state">No sessions</div>
              ) : (
                <>
                  {sessions.map(sess => (
                    <div
                      key={sess.session_id}
                      className={`list-item ${activeSelection?.type === 'sessions' && activeSelection?.id === sess.session_id ? 'active' : ''}`}
                      onClick={() => onSelectionChange({ type: 'session', id: sess.session_id })}
                      title={`Session ${sess.session_id}`}
                      style={{ alignItems: 'flex-start', height: 'auto', padding: '8px 8px' }}
                    >
                      <div
                        className={`status-dot ${sess.state?.toLowerCase()}`}
                        style={{ marginTop: '5px' }}
                        title={`State: ${sess.state}`}
                      />
                      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', lineHeight: '1.2', gap: '3px', width: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                          <span className="item-label" style={{ fontSize: '0.8rem', fontWeight: 600 }}>{sess.blueprint_id}</span>
                          <span className="item-meta" style={{ fontSize: '0.65rem', background: 'var(--color-gray-200)', padding: '1px 4px', borderRadius: '4px' }}>
                            {timeAgo(sess.started_at)}
                          </span>
                        </div>
                        <span className="item-meta">{sess.session_id.substring(0, 8)}...</span>
                      </div>
                    </div>
                  ))}
                  {/* Infinite Scroll Sentinel */}
                  {hasMoreSessions && (
                    <div ref={lastSessionElementRef} style={{ height: '20px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                      {loadingSessions && <span className="item-meta" style={{ fontSize: '0.7em' }}>Loading...</span>}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

      </div>

      {/* Footer / Compas Badge */}
      <div style={{ padding: '0.8rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.8rem', borderTop: '1px solid var(--color-stone-soft)', backgroundColor: 'var(--color-bg-subtle)' }}>
        <a href="https://compas.dev" target="_blank" rel="noopener noreferrer" style={{ display: 'block', opacity: 0.7 }}>
          <img src="https://compas.dev/badge-flat.svg" alt="COMPAS" style={{ maxWidth: collapsed ? '30px' : '100px', transition: 'all 0.3s', display: 'block' }} />
        </a>
      </div>
    </aside>
  );
}

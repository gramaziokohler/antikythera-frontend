import { useState } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { Dashboard } from './components/Dashboard'
import { Artifacts } from './components/Artifacts'
import { BlueprintsList } from './components/BlueprintsList'
import { SessionsList } from './components/SessionsList'
import { UploadBlueprint } from './components/UploadBlueprint'
import { SessionMonitor } from './components/SessionMonitor'
import { UserPromptDialog } from './components/UserPromptDialog'

import './styles/layout.css'
import './styles/components.css'
import './styles/session-monitor.css'

const API_BASE_URL = 'http://localhost:5174/api'

// Define the selection type used by the Sidebar
type Selection = {
  type: 'dashboard' | 'blueprint' | 'session' | 'upload-blueprint' | 'upload-model' | 'artifacts',
  id?: string
};

function App() {
  const [activeView, setActiveView] = useState<'dashboard' | 'blueprints' | 'upload-blueprint' | 'sessions' | 'artifacts'>('dashboard')
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [activeBlueprintId, setActiveBlueprintId] = useState<string | null>(null)

  // Triggers for data refetching
  const [blueprintsLastUpdate, setBlueprintsLastUpdate] = useState(0)

  const handleSelectionChange = (selection: Selection) => {
    // Reset transient states
    setActiveSessionId(null)
    setActiveBlueprintId(null)

    switch (selection.type) {
      case 'dashboard':
        setActiveView('dashboard')
        break
      case 'blueprint':
        setActiveView('blueprints') // Stay in blueprints context or switch?
        // Actually, if we select a blueprint from sidebar, we likely want to see its details/monitor immediately
        // BUT, currently the app structure treats "Blueprints" as a list view.
        // Let's assume selecting a blueprint ID shows the "Monitor" (preview mode) for it.
        if (selection.id) setActiveBlueprintId(selection.id)
        else setActiveView('blueprints') // Fallback to list
        break
      case 'session':
        setActiveView('sessions')
        if (selection.id) setActiveSessionId(selection.id)
        else setActiveView('sessions')
        break
      case 'artifacts':
        setActiveView('artifacts')
        break
      case 'upload-blueprint':
        setActiveView('upload-blueprint')
        // We could add a specific state to scroll to/highlight upload, 
        // but for now switching to the view where upload lives is sufficient.
        break
      case 'upload-model':
        setActiveView('artifacts')
        break
    }
  }

  const renderContent = () => {
    // If a specific session/blueprint is active, show the monitor overlay
    if (activeSessionId || activeBlueprintId) {
      return (
        <SessionMonitor
          key={activeSessionId || activeBlueprintId}
          apiBaseUrl={API_BASE_URL}
          sessionId={activeSessionId}
          blueprintId={activeBlueprintId}
          onClose={() => {
            setActiveSessionId(null)
            setActiveBlueprintId(null)
          }}
          onSessionCreated={(newSessionId) => {
            setActiveBlueprintId(null)
            setActiveSessionId(newSessionId)
          }}
        />
      )
    }

    switch (activeView) {
      case 'dashboard':
        return <Dashboard />
      case 'blueprints':
        return (
          <div className="view-container">
            <header className="page-header">
              <h1>Blueprints</h1>
              <p className="subtitle">Manage and execute your workflow blueprints.</p>
            </header>
            <div className="content-grid">
              <div className="panel upload-panel">
                <UploadBlueprint
                  apiBaseUrl={API_BASE_URL}
                  onUploadSuccess={() => setBlueprintsLastUpdate(Date.now())}
                />
              </div>
              <div className="panel list-panel">
                <BlueprintsList
                  apiBaseUrl={API_BASE_URL}
                  onSessionStart={(sessionId) => {
                    setActiveSessionId(sessionId)
                    setActiveBlueprintId(null)
                  }}
                  onBlueprintSelect={setActiveBlueprintId}
                  lastUpdate={blueprintsLastUpdate}
                />
              </div>
            </div>
          </div>
        )
      case 'upload-blueprint':
        return (
          <div className="view-container">
            <header className="page-header">
              <h1>New Blueprint</h1>
              <p className="subtitle">Upload a new orchestration plan.</p>
            </header>
            <div className="panel upload-panel" style={{ maxWidth: '800px', margin: '0 auto' }}>
              <UploadBlueprint
                apiBaseUrl={API_BASE_URL}
                onUploadSuccess={() => {
                  setBlueprintsLastUpdate(Date.now())
                  // Optionally redirect or show success
                  // setActiveView('blueprints') 
                }}
              />
            </div>
          </div>
        )
      case 'sessions':
        return (
          <div className="view-container">
            <header className="page-header">
              <h1>Sessions</h1>
              <p className="subtitle">Monitor and manage execution sessions.</p>
            </header>
            <SessionsList
              apiBaseUrl={API_BASE_URL}
              onSessionSelect={(sessionId) => {
                setActiveSessionId(sessionId)
                setActiveBlueprintId(null)
              }}
            />
          </div>
        )
      case 'artifacts':
        return <Artifacts apiBaseUrl={API_BASE_URL} />
      default:
        return <Dashboard />
    }
  }

  return (
    <div className="app-shell">
      <UserPromptDialog />

      <Sidebar
        apiBaseUrl={API_BASE_URL}
        onSelectionChange={handleSelectionChange}
        collapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        refreshTrigger={blueprintsLastUpdate}
        activeSelection={{
          type: activeView as any, // Cast because activeView is strictly typed but we want to match Selection.type roughly 
          id: activeView === 'sessions' ? activeSessionId || undefined : activeView === 'blueprints' ? activeBlueprintId || undefined : undefined
        }}
      />

      <main className={`main-content ${isSidebarCollapsed ? 'expanded' : ''}`}>
        {renderContent()}
      </main>
    </div>
  )
}

export default App

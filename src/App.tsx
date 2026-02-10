import { useState } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { Dashboard } from './components/Dashboard'
import { Artifacts } from './components/Artifacts'

import { SessionsList } from './components/SessionsList'
import { UploadBlueprint } from './components/UploadBlueprint'
import { SessionMonitor } from './components/SessionMonitor'
import { UserPromptDialog } from './components/UserPromptDialog'

import './styles/layout.css'
import './styles/components.css'
import './styles/session-monitor.css'

const API_BASE_URL = '/api'

// Define the selection type used by the Sidebar
type Selection = {
  type: 'dashboard' | 'blueprint' | 'session' | 'upload-blueprint' | 'upload-model' | 'artifacts',
  id?: string
};

function App() {
  const [activeView, setActiveView] = useState<'dashboard' | 'upload-blueprint' | 'sessions' | 'artifacts'>('dashboard')
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [activeBlueprintId, setActiveBlueprintId] = useState<string | null>(null)

  // Theme state
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)
  }




  const handleSelectionChange = (selection: Selection) => {
    // Reset transient states
    setActiveSessionId(null)
    setActiveBlueprintId(null)

    switch (selection.type) {
      case 'dashboard':
        setActiveView('dashboard')
        break
      case 'blueprint':
        if (selection.id) setActiveBlueprintId(selection.id)
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
        return (
          <div className="view-container">
            <Dashboard
              onNavigate={handleSelectionChange}
              apiBaseUrl={API_BASE_URL}
            />
          </div>
        )
      case 'upload-blueprint':
        return (
          <div className="view-container">
            <header className="page-header">
              <h1><span className="title-first">New</span> <span className="title-rest">Blueprint</span></h1>
              <p className="subtitle">Upload a new orchestration plan.</p>
            </header>
            <div className="panel upload-panel" style={{ maxWidth: '800px', margin: '0 auto' }}>
              <UploadBlueprint
                apiBaseUrl={API_BASE_URL}
              />
            </div>
          </div>
        )
      case 'sessions':
        return (
          <div className="view-container">
            <header className="page-header">
              <h1><span className="title-first">Execution</span> <span className="title-rest">Sessions</span></h1>
              <p className="subtitle">Monitor and manage your running workflows.</p>
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
        activeSelection={{
          type: activeView as any,
          id: activeView === 'sessions' ? activeSessionId || undefined : undefined
        }}
        theme={theme}
        toggleTheme={toggleTheme}
      />

      <main className={`main-content ${isSidebarCollapsed ? 'expanded' : ''}`}>
        {renderContent()}
      </main>
    </div>
  )
}

export default App

import { useState } from 'react'
import './styles/layout.css'
import './styles/components.css'
import './styles/session-monitor.css'
import { UploadBlueprint } from './components/UploadBlueprint'
import { BlueprintsList } from './components/BlueprintsList'
import { UploadModel } from './components/UploadModel'
import { ModelsList } from './components/ModelsList'
import { SessionMonitor } from './components/SessionMonitor'
import { CollapsibleSection } from './components/CollapsibleSection'

const API_BASE_URL = 'http://localhost:5174/api'

function App() {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [activeBlueprintId, setActiveBlueprintId] = useState<string | null>(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [blueprintsLastUpdate, setBlueprintsLastUpdate] = useState(0)

  return (
    <div className="app">
      
      <div className="logo-container">
        <img src="/antikythera.png" alt="Antikythera" className="logo" />
        <h1 className="app-title">antikythera</h1>
      </div>
      
      <div className="app-layout">
        <div className={`left-pane ${!isSidebarOpen ? 'collapsed' : ''}`}>
          <div className="left-pane-mask">
            <div className="left-pane-content">
              <CollapsibleSection title="Blueprints" className="blueprints-section-wrapper">
                <UploadBlueprint 
                  apiBaseUrl={API_BASE_URL} 
                  onUploadSuccess={() => setBlueprintsLastUpdate(Date.now())}
                />
                <BlueprintsList 
                  apiBaseUrl={API_BASE_URL}
                  onSessionStart={(sessionId) => {
                    setActiveSessionId(sessionId)
                    setActiveBlueprintId(null)
                  }}
                  onBlueprintSelect={setActiveBlueprintId}
                  lastUpdate={blueprintsLastUpdate}
                />
              </CollapsibleSection>

              <CollapsibleSection title="Models" className="models-section-wrapper" defaultOpen={false}>
                <UploadModel apiBaseUrl={API_BASE_URL} />
                <ModelsList apiBaseUrl={API_BASE_URL} />
              </CollapsibleSection>
            </div>
          </div>
          
          <button 
            className="sidebar-toggle"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            title={isSidebarOpen ? "Hide Sidebar" : "Show Sidebar"}
          >
            {isSidebarOpen ? '‹' : '›'}
          </button>
        </div>

        {activeSessionId || activeBlueprintId ? (
          <div className="right-pane">
            <SessionMonitor
              key={activeSessionId || activeBlueprintId}
              apiBaseUrl={API_BASE_URL}
              sessionId={activeSessionId}
              blueprintId={activeBlueprintId}
              onClose={() => {
                setActiveSessionId(null)
                setActiveBlueprintId(null)
              }}
            />
          </div>
        ) : (
          <div className="right-pane placeholder-pane">
            <p className="placeholder-text">No session currently running</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default App

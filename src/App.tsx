import { useState } from 'react'
import './App.css'
import { UploadBlueprint } from './components/UploadBlueprint'
import { BlueprintsList } from './components/BlueprintsList'
import { SessionMonitor } from './components/SessionMonitor'

const API_BASE_URL = 'http://localhost:5174/api'

function App() {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)

  return (
    <div className="app">
      <h1>Antikythera</h1>
      
      <div className="app-layout">
        <div className="left-pane">
          <UploadBlueprint 
            apiBaseUrl={API_BASE_URL}
          />
          
          <BlueprintsList 
            apiBaseUrl={API_BASE_URL}
            onSessionStart={setActiveSessionId}
          />
        </div>

        {activeSessionId ? (
          <div className="right-pane">
            <SessionMonitor
              apiBaseUrl={API_BASE_URL}
              sessionId={activeSessionId}
              onClose={() => setActiveSessionId(null)}
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

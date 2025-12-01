import { useRef } from 'react'
import './App.css'
import { UploadBlueprint } from './components/UploadBlueprint'
import { BlueprintsList } from './components/BlueprintsList'

const API_BASE_URL = 'http://localhost:8000'

function App() {
  const blueprintsListRef = useRef<{ refresh: () => void } | null>(null)

  const handleUploadSuccess = () => {
    // Refresh blueprints list after successful upload
    if (blueprintsListRef.current) {
      blueprintsListRef.current.refresh()
    }
  }

  return (
    <div className="app">
      <h1>Antikythera Orchestrator</h1>
      
      <UploadBlueprint 
        apiBaseUrl={API_BASE_URL}
        onUploadSuccess={handleUploadSuccess}
      />
      
      <BlueprintsList 
        apiBaseUrl={API_BASE_URL}
      />
    </div>
  )
}

export default App

import { createRoot } from 'react-dom/client'
import './index.css'
import AgentApp from './AgentApp.tsx'
import { AuthProvider } from './auth/AuthProvider'

createRoot(document.getElementById('root')!).render(
    <AuthProvider>
      <AgentApp />
    </AuthProvider>,
)

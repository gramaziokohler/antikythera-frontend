import { createRoot } from 'react-dom/client'
import './index.css'
import AgentApp from './AgentApp.tsx'

createRoot(document.getElementById('root')!).render(
    <AgentApp />,
)

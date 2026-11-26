import { createRoot } from 'react-dom/client'
import './index.css'
import ActorApp from './ActorApp.tsx'

createRoot(document.getElementById('root')!).render(
    <ActorApp />,
)

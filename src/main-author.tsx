import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { AuthorApp } from './AuthorApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthorApp />
  </StrictMode>,
)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { AuthorApp } from './AuthorApp'
import { AuthProvider } from './auth/AuthProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <AuthorApp />
    </AuthProvider>
  </StrictMode>,
)

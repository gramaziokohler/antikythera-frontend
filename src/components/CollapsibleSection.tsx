import { useState } from 'react'
import type { ReactNode } from 'react'

interface CollapsibleSectionProps {
  title: string
  children: ReactNode
  defaultOpen?: boolean
  className?: string
}

export function CollapsibleSection({ 
  title, 
  children, 
  defaultOpen = true,
  className = ''
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <section className={`collapsible-section ${className}`}>
      <div 
        className="section-header" 
        onClick={() => setIsOpen(!isOpen)}
      >
        <h2>{title}</h2>
        <span className={`arrow ${isOpen ? 'open' : ''}`}>▼</span>
      </div>
      {isOpen && (
        <div className="section-content">
          {children}
        </div>
      )}
    </section>
  )
}

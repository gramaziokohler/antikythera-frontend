import { useState, useRef } from 'react'
import type { UploadModelResponse } from '../types'

interface UploadModelProps {
  apiBaseUrl: string
}

export function UploadModel({ apiBaseUrl }: UploadModelProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploadMessage, setUploadMessage] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)

    try {
      setUploadMessage('Uploading...')
      const response = await fetch(`${apiBaseUrl}/models/upload`, {
        method: 'POST',
        body: formData,
      })
      
      if (!response.ok) throw new Error('Upload failed')
      
      const data: UploadModelResponse = await response.json()
      setUploadMessage(data.message)
      
      // Clear message after 3 seconds
      setTimeout(() => setUploadMessage(''), 3000)
    } catch (err) {
      setUploadMessage(err instanceof Error ? err.message : 'Upload failed')
      setTimeout(() => setUploadMessage(''), 3000)
    }
  }

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0])
    }
  }

  const onClick = () => {
    fileInputRef.current?.click()
  }

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0])
      e.target.value = ''
    }
  }

  return (
    <div className="upload-compact-wrapper">
      <div 
        className={`upload-drop-zone ${isDragging ? 'dragging' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={onClick}
        title="Click or drag file to upload model"
      >
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden-file-input" 
          onChange={onFileChange} 
          accept=".json" 
        />
        <div className="upload-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </div>
        <span className="upload-text">Upload Model</span>
      </div>
      {uploadMessage && <div className={`upload-status-toast ${uploadMessage.includes('failed') ? 'error' : ''}`}>{uploadMessage}</div>}
    </div>
  )
}

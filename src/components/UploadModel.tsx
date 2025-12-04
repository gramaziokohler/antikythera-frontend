import { useState } from 'react'
import type { UploadModelResponse } from '../types'

interface UploadModelProps {
  apiBaseUrl: string
}

export function UploadModel({ apiBaseUrl }: UploadModelProps) {
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadMessage, setUploadMessage] = useState<string>('')

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setUploadFile(e.target.files[0])
      setUploadMessage('')
    }
  }

  const handleUpload = async () => {
    if (!uploadFile) {
      setUploadMessage('Please select a file')
      return
    }

    const formData = new FormData()
    formData.append('file', uploadFile)

    try {
      const response = await fetch(`${apiBaseUrl}/models/upload`, {
        method: 'POST',
        body: formData,
      })
      
      if (!response.ok) throw new Error('Upload failed')
      
      const data: UploadModelResponse = await response.json()
      setUploadMessage(data.message)
      setUploadFile(null)
      
      // Clear file input
      const fileInput = document.getElementById('model-file-input') as HTMLInputElement
      if (fileInput) fileInput.value = ''
    } catch (err) {
      setUploadMessage(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  return (
    <div className="upload-container">
      <div className="upload-controls">
        <input 
          type="file" 
          accept=".json"
          onChange={handleFileChange}
          id="model-file-input"
        />
        <button 
          onClick={handleUpload}
          disabled={!uploadFile}
        >
          Upload
        </button>
      </div>
      {uploadMessage && (
        <div className={uploadMessage.includes('failed') ? 'error' : 'message'}>
          {uploadMessage}
        </div>
      )}
    </div>
  )
}

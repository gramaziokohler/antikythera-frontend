import { useState } from 'react'
import type { UploadBlueprintResponse } from '../types'

interface UploadBlueprintProps {
  apiBaseUrl: string
}

export function UploadBlueprint({ apiBaseUrl }: UploadBlueprintProps) {
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
      const response = await fetch(`${apiBaseUrl}/blueprints/upload`, {
        method: 'POST',
        body: formData,
      })
      
      if (!response.ok) throw new Error('Upload failed')
      
      const data: UploadBlueprintResponse = await response.json()
      setUploadMessage(data.message)
      setUploadFile(null)
      
      // Clear file input
      const fileInput = document.getElementById('file-input') as HTMLInputElement
      if (fileInput) fileInput.value = ''
    } catch (err) {
      setUploadMessage(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  return (
    <section className="upload-section">
      <h2>Upload Blueprint</h2>
      <div className="upload-controls">
        <input
          id="file-input"
          type="file"
          accept=".json"
          onChange={handleFileChange}
        />
        <button onClick={handleUpload} disabled={!uploadFile}>
          Upload
        </button>
      </div>
      {uploadMessage && <p className="message">{uploadMessage}</p>}
    </section>
  )
}

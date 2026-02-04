import { useState, useEffect } from 'react'
import type { StartBlueprintResponse } from '../types'

interface StartSessionDialogProps {
    apiBaseUrl: string
    blueprintId: string
    blueprintName: string
    onSessionStarted: (sessionId: string) => void
    onCancel: () => void
}

export function StartSessionDialog({ apiBaseUrl, blueprintId, onSessionStarted, onCancel }: StartSessionDialogProps) {
    const [blueprintParams, setBlueprintParams] = useState<Array<{ key: string, value: string, type: 'custom' | 'model' }>>([])
    const [models, setModels] = useState<string[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        fetchModels()
    }, [apiBaseUrl])

    // Handle Escape key to cancel dialog
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !loading) {
                onCancel()
            }
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [onCancel, loading])

    const fetchModels = async () => {
        try {
            const response = await fetch(`${apiBaseUrl}/models`)
            if (response.ok) {
                const data: string[] = await response.json()
                setModels(data)
            }
        } catch (err) {
            console.error('Failed to fetch models', err)
        }
    }

    const addParam = () => {
        setBlueprintParams(prev => [...prev, { key: '', value: '', type: 'custom' }])
    }

    const updateParam = (index: number, field: 'key' | 'value' | 'type', value: string) => {
        setBlueprintParams(prev => {
            const currentParams = [...prev]
            const currentParam = { ...currentParams[index] }

            if (field === 'type') {
                const newType = value as 'custom' | 'model'
                currentParam.type = newType
                if (newType === 'model') {
                    currentParam.key = 'model_id'
                    currentParam.value = models.length > 0 ? models[0] : ''
                } else {
                    currentParam.key = ''
                    currentParam.value = ''
                }
            } else {
                currentParam[field] = value
            }

            currentParams[index] = currentParam
            return currentParams
        })
    }

    const removeParam = (index: number) => {
        setBlueprintParams(prev => {
            const currentParams = [...prev]
            currentParams.splice(index, 1)
            return currentParams
        })
    }

    const handleConfirmStart = async () => {
        setLoading(true)
        setError(null)

        const params: Record<string, string> = {}
        for (const p of blueprintParams) {
            if (p.key.trim()) {
                params[p.key.trim()] = p.value
            }
        }

        try {
            const response = await fetch(`${apiBaseUrl}/blueprints/start`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    blueprint_id: blueprintId,
                    broker_host: '127.0.0.1',
                    broker_port: 1883,
                    params: Object.keys(params).length > 0 ? params : undefined,
                }),
            })

            if (!response.ok) throw new Error('Failed to start blueprint')

            const data: StartBlueprintResponse = await response.json()
            onSessionStarted(data.session_id)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to start blueprint')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="user-prompt-overlay">
            <div className="user-prompt-dialog">
                <h3><span className="dialog-title-first">Start</span> <span className="dialog-title-rest">Session</span></h3>
                <p className="dialog-description">Configure parameters for this session.</p>

                {error && <p className="dialog-error">{error}</p>}

                <div className="params-container params-list">
                    {blueprintParams.length === 0 && (
                        <p className="params-empty">No parameters added.</p>
                    )}
                    {blueprintParams.map((param, index) => (
                        <div key={index} className="param-row">
                            <select
                                value={param.type}
                                onChange={(e) => updateParam(index, 'type', e.target.value)}
                                className="param-type-select"
                            >
                                <option value="custom">Custom</option>
                                <option value="model">Model</option>
                            </select>

                            {param.type === 'model' ? (
                                <>
                                    <input
                                        type="text"
                                        value="model_id"
                                        hidden
                                        className="param-input"
                                        title="Key is fixed to model_id"
                                    />
                                    <select
                                        value={param.value}
                                        onChange={(e) => updateParam(index, 'value', e.target.value)}
                                        className="param-input"
                                    >
                                        {models.length === 0 && <option value="">No models available</option>}
                                        {models.map(modelId => (
                                            <option key={modelId} value={modelId}>{modelId}</option>
                                        ))}
                                    </select>
                                </>
                            ) : (
                                <>
                                    <input
                                        type="text"
                                        placeholder="Key"
                                        value={param.key}
                                        onChange={(e) => updateParam(index, 'key', e.target.value)}
                                        className="param-input"
                                    />
                                    <input
                                        type="text"
                                        placeholder="Value"
                                        value={param.value}
                                        onChange={(e) => updateParam(index, 'value', e.target.value)}
                                        className="param-input"
                                    />
                                </>
                            )}
                            <button
                                onClick={() => removeParam(index)}
                                className="remove-param-btn"
                                title="Remove parameter"
                            >
                                ×
                            </button>
                        </div>
                    ))}
                </div>

                <div className="dialog-footer">
                    <button
                        onClick={addParam}
                        className="add-param-btn"
                    >
                        + Add Parameter
                    </button>
                </div>

                <div className="user-prompt-actions">
                    <button onClick={onCancel} disabled={loading}>
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirmStart}
                        disabled={loading}
                        className="start-preview-btn"
                    >
                        {loading ? 'Starting...' : 'New Session'}
                    </button>
                </div>
            </div>
        </div>
    )
}

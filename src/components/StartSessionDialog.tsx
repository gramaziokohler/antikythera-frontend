import { useState, useEffect } from 'react'
import type { StartBlueprintResponse } from '../types'

interface StartSessionDialogProps {
    apiBaseUrl: string
    blueprintId: string
    blueprintName: string
    onSessionStarted: (sessionId: string) => void
    onCancel: () => void
}

export function StartSessionDialog({ apiBaseUrl, blueprintId, blueprintName, onSessionStarted, onCancel }: StartSessionDialogProps) {
    const [blueprintParams, setBlueprintParams] = useState<Array<{ key: string, value: string, type: 'custom' | 'model' }>>([])
    const [models, setModels] = useState<string[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        fetchModels()
    }, [apiBaseUrl])

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
        <div className="user-prompt-overlay" style={{ backgroundColor: 'rgba(0,0,0,0.5)', position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div className="user-prompt-dialog" style={{ backgroundColor: 'white', padding: '24px', borderRadius: '8px', maxWidth: '500px', width: '90%', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                <h3>Start Session: {blueprintName}</h3>
                <p className="description" style={{ marginBottom: '1rem' }}>Configure parameters for this session.</p>

                {error && <p className="error" style={{ color: 'red', marginBottom: '10px' }}>{error}</p>}

                <div className="params-list" style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '1rem', border: '1px solid #eee', padding: '10px', borderRadius: '6px' }}>
                    {blueprintParams.length === 0 && (
                        <p style={{ fontStyle: 'italic', color: '#999', textAlign: 'center', padding: '10px' }}>No parameters added.</p>
                    )}
                    {blueprintParams.map((param, index) => (
                        <div key={index} className="param-row" style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                            <select
                                value={param.type}
                                onChange={(e) => updateParam(index, 'type', e.target.value)}
                                className="param-type-select"
                                style={{ width: '90px' }}
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
                                        style={{ flex: 1 }}
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
                                        style={{ flex: 1 }}
                                    />
                                    <input
                                        type="text"
                                        placeholder="Value"
                                        value={param.value}
                                        onChange={(e) => updateParam(index, 'value', e.target.value)}
                                        className="param-input"
                                        style={{ flex: 1 }}
                                    />
                                </>
                            )}
                            <button
                                onClick={() => removeParam(index)}
                                className="remove-param-btn"
                                title="Remove parameter"
                                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#666' }}
                            >
                                ×
                            </button>
                        </div>
                    ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                    <button
                        onClick={addParam}
                        className="add-param-btn"
                        style={{ background: 'none', border: '1px dashed #ccc', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem' }}
                    >
                        + Add Parameter
                    </button>
                </div>

                <div className="user-prompt-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button onClick={onCancel} disabled={loading} style={{ padding: '8px 16px', background: 'white', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', color: '#333' }}>
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirmStart}
                        disabled={loading}
                        className="start-preview-btn"
                        style={{ padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', border: 'none' }}
                    >
                        {loading ? 'Starting...' : 'New Session'}
                    </button>
                </div>
            </div>
        </div>
    )
}

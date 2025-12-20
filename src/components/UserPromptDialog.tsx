import { useState, useEffect } from 'react'
import { UserPromptAgent, type UserPromptOptions } from '../agents/UserPromptAgent'
import { MqttService } from '../services/MqttService'

interface PendingPrompt extends UserPromptOptions {
    taskId: string
}

export function UserPromptDialog() {
    const [prompts, setPrompts] = useState<PendingPrompt[]>([])
    const [agent, setAgent] = useState<UserPromptAgent | null>(null)

    useEffect(() => {
        const mqttService = MqttService.getInstance();
        const newAgent = new UserPromptAgent(mqttService, (taskId, options) => {
            setPrompts(prev => [...prev, { taskId, ...options }])
        })
        setAgent(newAgent)

        return () => {
            newAgent.dispose()
        }
    }, [])

    const handleOptionClick = (taskId: string, option: string) => {
        if (agent) {
            agent.resolvePrompt(taskId, option)
            setPrompts(prev => prev.filter(p => p.taskId !== taskId))
        }
    }

    if (prompts.length === 0) return null

    return (
        <div className="user-prompt-overlay">
            {prompts.map(prompt => (
                <div key={prompt.taskId} className="user-prompt-dialog">
                    <h3>User Confirmation Required</h3>
                    <p>{prompt.message}</p>
                    <div className="user-prompt-actions">
                        {prompt.options.map(option => (
                            <button key={option} onClick={() => handleOptionClick(prompt.taskId, option)}>
                                {option}
                            </button>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    )
}

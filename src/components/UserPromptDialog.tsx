import { useState, useEffect } from 'react'
import { UserPromptAgent, type UserPromptOptions } from '../agents/UserPromptAgent'
import { MqttService } from '../services/MqttService'
import { AgentLauncher } from '../agents/AgentLauncher'

interface PendingPrompt extends UserPromptOptions {
    taskId: string
}

export function UserPromptDialog() {
    const [prompts, setPrompts] = useState<PendingPrompt[]>([])
    const [agent, setAgent] = useState<UserPromptAgent | null>(null)

    useEffect(() => {
        const mqttService = MqttService.getInstance();
        const agentLauncher = AgentLauncher.getInstance(mqttService);

        const newAgent = new UserPromptAgent(
            (taskId, options) => {
                setPrompts(prev => [...prev, { taskId, ...options }])
            },
            (taskId) => {
                setPrompts(prev => prev.filter(p => p.taskId !== taskId))
            }
        )

        agentLauncher.registerAgent(newAgent);
        setAgent(newAgent)

        return () => {
            agentLauncher.unregisterAgent(newAgent.type);
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

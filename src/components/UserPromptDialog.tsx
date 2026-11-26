import { useState, useEffect } from 'react'
import { UserPromptActor, type UserPromptOptions } from '../actors/UserPromptActor'
import { MqttService } from "@gramaziokohler/antikythera-ts/actors"
import { ActorLauncher } from "@gramaziokohler/antikythera-ts/actors"

interface PendingPrompt extends UserPromptOptions {
    taskId: string
}

export function UserPromptDialog() {
    const [prompts, setPrompts] = useState<PendingPrompt[]>([])
    const [actor, setActor] = useState<UserPromptActor | null>(null)

    useEffect(() => {
        const mqttService = MqttService.getInstance();
        const actorLauncher = ActorLauncher.getInstance(mqttService);

        const newActor = new UserPromptActor(
            (taskId, options) => {
                setPrompts(prev => [...prev, { taskId, ...options }])
            },
            (taskId) => {
                setPrompts(prev => prev.filter(p => p.taskId !== taskId))
            }
        )

        actorLauncher.registerActor(newActor);
        setActor(newActor)

        return () => {
            actorLauncher.unregisterActor(newActor.type);
        }
    }, [])

    const handleOptionClick = (taskId: string, option: string) => {
        if (actor) {
            actor.resolvePrompt(taskId, option)
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

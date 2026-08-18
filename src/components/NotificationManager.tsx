import { useState, useEffect } from 'react'
import { MqttService } from '../services/MqttService'
import { AgentLauncher } from '../agents/AgentLauncher'
import { NotificationAgent } from '../agents/NotificationAgent'
import { notifications as notificationStore } from '../services/NotificationStore'
import { NotificationOverlay, type Notification } from './NotificationOverlay'

import '../styles/NotificationOverlay.css'

export function NotificationManager() {
    const [notifications, setNotifications] = useState<Notification[]>([])

    // Renders everything in the shared store, whether it came from a notification
    // task over MQTT or from the app itself (e.g. a session failure).
    useEffect(() => notificationStore.subscribe(setNotifications), [])

    useEffect(() => {
        const service = MqttService.getInstance();
        const agentLauncher = AgentLauncher.getInstance(service);

        // Register NotificationAgent
        const notificationAgent = new NotificationAgent((taskId, options) => {
            // Use a unique ID for the notification to allow duplicates of the same task ID
            // (e.g. re-running the same blueprint)
            const uniqueId = `${taskId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            notificationStore.notify({
                id: uniqueId,
                title: options.title,
                message: options.message,
                level: options.level,
            });
        });

        agentLauncher.registerAgent(notificationAgent);

        return () => {
            agentLauncher.unregisterAgent(notificationAgent.type);
            // notificationAgent doesn't need explicit dispose
        }
    }, [])

    return <NotificationOverlay notifications={notifications} onDismiss={(id) => notificationStore.dismiss(id)} />
}

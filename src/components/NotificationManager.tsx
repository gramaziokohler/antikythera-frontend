import { useState, useEffect } from 'react'
import { MqttService } from '../services/MqttService'
import { AgentLauncher } from '../agents/AgentLauncher'
import { NotificationAgent } from '../agents/NotificationAgent'
import { NotificationOverlay, type Notification } from './NotificationOverlay'

import '../styles/NotificationOverlay.css'

export function NotificationManager() {
    const [notifications, setNotifications] = useState<Notification[]>([])

    useEffect(() => {
        const service = MqttService.getInstance();
        const agentLauncher = AgentLauncher.getInstance(service);

        // Register NotificationAgent
        const notificationAgent = new NotificationAgent((taskId, options) => {
            // Use a unique ID for the notification to allow duplicates of the same task ID
            // (e.g. re-running the same blueprint)
            const uniqueId = `${taskId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            const newNotification: Notification = {
                id: uniqueId,
                title: options.title,
                message: options.message,
                level: options.level,
                timestamp: Date.now()
            };

            setNotifications(prev => [newNotification, ...prev]);
        });

        agentLauncher.registerAgent(notificationAgent);

        return () => {
            agentLauncher.unregisterAgent(notificationAgent.type);
            // notificationAgent doesn't need explicit dispose 
        }
    }, [])

    const dismissNotification = (id: string) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    };

    return <NotificationOverlay notifications={notifications} onDismiss={dismissNotification} />
}

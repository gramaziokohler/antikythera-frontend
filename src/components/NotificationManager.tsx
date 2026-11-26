import { useState, useEffect } from 'react'
import { MqttService } from "@gramaziokohler/antikythera-ts/actors"
import { ActorLauncher } from "@gramaziokohler/antikythera-ts/actors"
import { NotificationActor } from '../actors/NotificationActor'
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
        const actorLauncher = ActorLauncher.getInstance(service);

        // Register NotificationActor
        const notificationActor = new NotificationActor((taskId, options) => {
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

        actorLauncher.registerActor(notificationActor);

        return () => {
            actorLauncher.unregisterActor(notificationActor.type);
            // notificationActor doesn't need explicit dispose
        }
    }, [])

    return <NotificationOverlay notifications={notifications} onDismiss={(id) => notificationStore.dismiss(id)} />
}

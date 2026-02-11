import type { Agent } from './Agent';
import { Task } from './Task';
import { ExecutionContext } from './ExecutionContext';

export interface NotificationOptions {
    title: string;
    message: string;
    level: 'info' | 'success' | 'warning' | 'error';
}

export class NotificationAgent implements Agent {
    type = "user_interaction";
    private onNotifyCallback: (taskId: string, options: NotificationOptions) => void;

    constructor(
        onNotify: (taskId: string, options: NotificationOptions) => void
    ) {
        this.onNotifyCallback = onNotify;
    }

    /**
     * Tool: notify
     * Matches task type: notification.notify
     */
    async notify(task: Task, context?: ExecutionContext): Promise<any> {
        const inputs = task.inputs || {};
        const params = task.params || {};
        const taskContext = task.context || {};

        // Helper: Input > Param > Default
        const resolve = (key: string, defaultValue: string) => {
            if (inputs[key] !== undefined && inputs[key] !== null) return String(inputs[key]);
            if (params[key] !== undefined && params[key] !== null) return String(params[key]);
            return defaultValue;
        };

        // Helper: Simple Python-style interpolation: "Hello {name}" -> "Hello World"
        const interpolate = (template: string, data: any) => {
            return template.replace(/{(\w+)}/g, (match, key) => {
                return data[key] !== undefined ? String(data[key]) : match;
            });
        };

        let title = resolve('title', 'Notification');
        let message = resolve('message', '');
        const level = resolve('level', 'info') as 'info' | 'success' | 'warning' | 'error';

        // Interpolate using inputs and context (inputs override context)
        const interpolationData = { ...taskContext, ...inputs };
        title = interpolate(title, interpolationData);
        message = interpolate(message, interpolationData);
        console.log(`[NotificationAgent] Resolved notification for task ${task.id}: (${JSON.stringify(interpolationData)})`);

        this.handleNotification(task.id, { title, message, level });

        return { status: "displayed" };
    }

    private handleNotification(taskId: string, options: NotificationOptions) {
        const { title, message, level } = options;
        console.log(`[NotificationAgent] Displaying notification: ${title}: ${message} (${level})`);
        this.onNotifyCallback(taskId, { title, message, level });
    }

    public dispose() {
    }
}

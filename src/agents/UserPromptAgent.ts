import type { Agent } from './Agent';
import { ExecutionContext } from './ExecutionContext';
import { Task } from './Task';

export interface UserPromptOptions {
    message: string;
    options: string[];
}

export class UserPromptAgent implements Agent {
    type = "user_prompt";
    private onPromptCallback: (taskId: string, options: UserPromptOptions) => void;
    private onCancelCallback?: (taskId: string) => void;
    private pendingResolvers: Map<string, (value: any) => void> = new Map();
    private pendingRejecters: Map<string, (reason?: any) => void> = new Map();

    constructor(
        onPrompt: (taskId: string, options: UserPromptOptions) => void,
        onCancel?: (taskId: string) => void
    ) {
        this.onPromptCallback = onPrompt;
        this.onCancelCallback = onCancel;
    }

    /**
     * Tool: confirm
     * Matches task type: user_prompt.confirm
     */
    async confirm(task: Task, context?: ExecutionContext): Promise<any> {
        let message = "Please confirm";
        let options = ["OK", "Cancel"];
        const params = task.params;

        if (params) {
            if (typeof params['message'] === 'string') {
                message = params['message'];
            }
            if (Array.isArray(params['options'])) {
                options = params['options'];
            }
        }

        console.log(`Prompting user for task ${task.id}: ${message} [${options.join(', ')}]`);

        // Return a promise that resolves when resolvePrompt is called
        return new Promise((resolve, reject) => {
            this.pendingResolvers.set(task.id, resolve);
            this.pendingRejecters.set(task.id, reject);

            if (context) {
                context.onCancel(() => {
                    this.cleanup(task.id);
                    if (this.onCancelCallback) {
                        this.onCancelCallback(task.id);
                    }
                    reject(new Error("Task cancelled"));
                });
            }

            this.onPromptCallback(task.id, { message, options });
        });
    }

    public resolvePrompt(taskId: string, result: string) {
        const resolve = this.pendingResolvers.get(taskId);
        if (resolve) {
            this.cleanup(taskId);
            // Return object expected by AgentLauncher to be wrapped in AnyData
            resolve({ result: result });
        } else {
            console.warn(`No pending resolver found for task ${taskId}`);
        }
    }

    private cleanup(taskId: string) {
        this.pendingResolvers.delete(taskId);
        this.pendingRejecters.delete(taskId);
    }
}

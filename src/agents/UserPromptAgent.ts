import type { Agent } from './Agent';
import { Task } from './Task';

export interface UserPromptOptions {
    message: string;
    options: string[];
}

export class UserPromptAgent implements Agent {
    type = "user_prompt";
    private onPromptCallback: (taskId: string, options: UserPromptOptions) => void;
    private pendingResolvers: Map<string, (value: any) => void> = new Map();

    constructor(onPrompt: (taskId: string, options: UserPromptOptions) => void) {
        this.onPromptCallback = onPrompt;
    }

    /**
     * Tool: confirm
     * Matches task type: user_prompt.confirm
     */
    async confirm(task: Task): Promise<any> {
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
        return new Promise((resolve) => {
            this.pendingResolvers.set(task.id, resolve);
            this.onPromptCallback(task.id, { message, options });
        });
    }

    public resolvePrompt(taskId: string, result: string) {
        const resolve = this.pendingResolvers.get(taskId);
        if (resolve) {
            // Return object expected by AgentManager to be wrapped in AnyData
            resolve({ result: result });
            this.pendingResolvers.delete(taskId);
        } else {
            console.warn(`No pending resolver found for task ${taskId}`);
        }
    }
}

import { Task } from './Task';
import { ExecutionContext } from './ExecutionContext';

export type ToolFunction = (task: Task, context?: ExecutionContext) => Promise<any>;

export interface Agent {
    /**
     * The type of the agent.
     * Used for matching task types: "{agent.type}.{tool_name}"
     */
    type: string;

    /**
     * Index signature to allow dynamic access to tool methods.
     * Tool methods should accept a Task instance and return a Promise that resolves to the output of the task.
     */
    [key: string]: any;
}

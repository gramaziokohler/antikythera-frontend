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
     * Optional predicate: does this agent handle the given tool name (the part of the task
     * type after "{agent.type}."). Defaults to `typeof agent[toolName] === 'function'` when
     * omitted. Implement this instead for an agent that claims every tool under its prefix
     * rather than one method per tool (e.g. a stand-in agent).
     */
    canHandleTool?(toolName: string): boolean;

    /**
     * Optional generic tool invocation, used in place of calling `agent[toolName](task, context)`
     * when no method named after the tool exists on the agent. Required if `canHandleTool` is
     * implemented and no per-tool methods exist.
     */
    invokeTool?(toolName: string, task: Task, context?: ExecutionContext): Promise<any>;

    /**
     * Index signature to allow dynamic access to tool methods.
     * Tool methods should accept a Task instance and return a Promise that resolves to the output of the task.
     */
    [key: string]: any;
}

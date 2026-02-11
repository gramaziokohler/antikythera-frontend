import { MqttService } from '../services/MqttService';
import { uniqueNamesGenerator, adjectives, animals, colors, countries } from 'unique-names-generator';
import { antikythera, google, compas_pb } from '../proto/bundle';
import type { Agent } from './Agent';
import { Task } from './Task';
import { ExecutionContext } from './ExecutionContext';

// Type aliases for convenience
type TaskAssignmentMessage = antikythera.v1.ITaskAssignmentMessage;
type TaskClaimRequest = antikythera.v1.ITaskClaimRequest;
type TaskAllocationMessage = antikythera.v1.ITaskAllocationMessage;
type TaskCompletionMessage = antikythera.v1.ITaskCompletionMessage;
type TaskState = antikythera.v1.TaskState;

export class AgentLauncher {
    private static instance: AgentLauncher;
    private mqttService: MqttService;
    private agents: Map<string, Agent> = new Map();

    private agentId: string;
    private pendingClaims: Map<string, TaskAssignmentMessage> = new Map();
    private activeTasks: Map<string, TaskAssignmentMessage> = new Map();
    private activeContexts: Map<string, ExecutionContext> = new Map();
    private messageHandlerCleanup: (() => void) | undefined;

    private constructor(mqttService: MqttService) {
        this.mqttService = mqttService;
        const randomName = uniqueNamesGenerator({
            dictionaries: [adjectives, colors, animals],
            length: 3,
            separator: '-',
            style: 'lowerCase'
        });
        const randomLocation = uniqueNamesGenerator({ dictionaries: [countries], length: 1, style: 'lowerCase' });

        // Ensure internally spaced names (like "han solo") become "han-solo"
        this.agentId = `${randomName.replace(/ /g, '-')}-of-${randomLocation.replace(/ /g, '-')}`;

        console.log(`Initializing Agent Launcher ${this.agentId}`);

        // Register message handler
        this.messageHandlerCleanup = this.mqttService.onMessage(this.onMessage.bind(this));

        // Subscribe to topics
        this.initializeSubscriptions();
    }

    public static getInstance(mqttService?: MqttService): AgentLauncher {
        if (!AgentLauncher.instance) {
            if (!mqttService) {
                throw new Error("AgentLauncher must be initialized with MqttService first");
            }
            AgentLauncher.instance = new AgentLauncher(mqttService);
        }
        return AgentLauncher.instance;
    }

    public getAgentId(): string {
        return this.agentId;
    }

    public registerAgent(agent: Agent) {
        if (this.agents.has(agent.type)) {
            console.warn(`Agent type ${agent.type} is already registered. Overwriting.`);
        }
        console.log(`Registering agent: ${agent.type}`);
        this.agents.set(agent.type, agent);
    }

    public unregisterAgent(agentType: string) {
        this.agents.delete(agentType);
    }

    protected async initializeSubscriptions() {
        await this.mqttService.subscribe('antikythera/task/start');
        await this.mqttService.subscribe('antikythera/task/allocation');
        await this.mqttService.subscribe('antikythera/task/ack');
    }

    protected onMessage(topic: string, message: Buffer) {
        try {
            const uint8Message = new Uint8Array(message);

            if (topic === 'antikythera/task/start') {
                let task: TaskAssignmentMessage | null = null;

                // Try to unwrap MessageData -> AnyData -> Any -> TaskAssignmentMessage
                const anyMsg = this.unwrapMessage(uint8Message);
                if (anyMsg) {
                    if (anyMsg.type_url === 'type.googleapis.com/antikythera.v1.TaskAssignmentMessage') {
                        task = antikythera.v1.TaskAssignmentMessage.decode(anyMsg.value as Uint8Array);
                    }
                }

                if (!task) {
                    // Fallback
                    try {
                        task = antikythera.v1.TaskAssignmentMessage.decode(uint8Message);
                    } catch (e) {
                        // ignore
                    }
                }

                if (task) {
                    this.handleTaskStart(task);
                }

            } else if (topic === 'antikythera/task/allocation') {
                let allocation: TaskAllocationMessage | null = null;

                const anyMsg = this.unwrapMessage(uint8Message);
                if (anyMsg) {
                    if (anyMsg.type_url === 'type.googleapis.com/antikythera.v1.TaskAllocationMessage') {
                        allocation = antikythera.v1.TaskAllocationMessage.decode(anyMsg.value as Uint8Array);
                    }
                }

                if (!allocation) {
                    try {
                        allocation = antikythera.v1.TaskAllocationMessage.decode(uint8Message);
                    } catch (e) {
                        // ignore
                    }
                }

                if (allocation) {
                    this.handleTaskAllocation(allocation);
                }
            } else if (topic === 'antikythera/task/ack') {
                let ack: antikythera.v1.TaskCompletionAckMessage | null = null;
                const anyMsg = this.unwrapMessage(uint8Message);
                if (anyMsg) {
                    if (anyMsg.type_url === 'type.googleapis.com/antikythera.v1.TaskCompletionAckMessage') {
                        ack = antikythera.v1.TaskCompletionAckMessage.decode(anyMsg.value as Uint8Array);
                    }
                }
                if (!ack) {
                    try {
                        ack = antikythera.v1.TaskCompletionAckMessage.decode(uint8Message);
                    } catch (e) { }
                }

                if (ack && ack.acceptedAgentId !== this.agentId) {
                    const context = this.activeContexts.get(ack.id!);
                    if (context) {
                        console.warn(`[${ack.id}] received ACK for ${ack.acceptedAgentId}, cancelling local execution.`);
                        context.cancel();
                    }
                }
            }
        } catch (err) {
            console.error('Error processing message:', err);
        }
    }

    private unwrapMessage(uint8Message: Uint8Array): google.protobuf.IAny | null {
        // 1. Try compas_pb.data.MessageData
        try {
            const msgData = compas_pb.data.MessageData.decode(uint8Message);
            if (msgData.version || msgData.data) {
                if (msgData.data && msgData.data.message) {
                    return msgData.data.message;
                }
            }
        } catch (e) { /* Not MessageData */ }

        // 2. Try compas_pb.data.AnyData
        try {
            const anyData = compas_pb.data.AnyData.decode(uint8Message);
            if (anyData.message) {
                return anyData.message;
            }
        } catch (e) { /* Not AnyData */ }

        // 3. Try google.protobuf.Any
        try {
            const anyMsg = google.protobuf.Any.decode(uint8Message);
            if (anyMsg.type_url && anyMsg.type_url.startsWith('type.googleapis.com/')) {
                return anyMsg;
            }
        } catch (e) { /* Not Any */ }

        return null;
    }

    private wrapMessage(messageBytes: Uint8Array, typeUrl: string): Uint8Array {
        const anyMsg = google.protobuf.Any.create({
            type_url: typeUrl,
            value: messageBytes
        });
        const anyData = compas_pb.data.AnyData.create({
            message: anyMsg
        });
        const msgData = compas_pb.data.MessageData.create({
            version: '0.4.6',
            data: anyData
        });
        return compas_pb.data.MessageData.encode(msgData).finish();
    }

    protected handleTaskStart(task: TaskAssignmentMessage) {
        if (!task.type || !task.id) return;

        // Parse task type: {agent_type}.{tool_name}
        const { agent, toolName } = this.findAgentForTaskType(task.type);

        if (agent && toolName) {
            console.log(`Task ${task.id} (${task.type}) matches agent ${agent.type}, tool ${toolName}. Claiming...`);
            this.pendingClaims.set(task.id, task);

            const claim: TaskClaimRequest = {
                taskId: task.id,
                agentId: this.agentId,
                timestamp: { seconds: Math.floor(Date.now() / 1000) } as any
            };

            const innerBuffer = antikythera.v1.TaskClaimRequest.encode(claim).finish();
            const buffer = this.wrapMessage(innerBuffer, 'type.googleapis.com/antikythera.v1.TaskClaimRequest');

            this.mqttService.publish('antikythera/task/claim', buffer);
        }
    }

    private findAgentForTaskType(taskType: string): { agent: Agent | null, toolName: string | null } {
        // Try to match registered agents
        // We iterate over all registered agents and see if the taskType starts with the agent.type + "."
        for (const agent of this.agents.values()) {
            const prefix = agent.type + ".";
            if (taskType.startsWith(prefix)) {
                const toolName = taskType.substring(prefix.length);
                // Check if the agent actually has this tool
                if (typeof agent[toolName] === 'function') {
                    return { agent, toolName };
                }
            }
        }
        return { agent: null, toolName: null };
    }

    protected async handleTaskAllocation(allocation: TaskAllocationMessage) {
        if (allocation.assignedAgentId === this.agentId) {
            const taskId = allocation.taskId!;
            const task = this.pendingClaims.get(taskId);

            if (task) {
                console.log(`Task ${taskId} allocated to me. Executing...`);
                this.pendingClaims.delete(taskId);
                this.activeTasks.set(taskId, task);

                await this.executeTask(task);
            } else {
                console.warn(`Task ${taskId} allocated but not found in pending claims.`);
            }
        }
    }

    protected async executeTask(task: TaskAssignmentMessage) {
        const { agent, toolName } = this.findAgentForTaskType(task.type!);

        if (!agent || !toolName) {
            console.error(`Could not find agent/tool for allocated task ${task.type}`);
            this.completeTask(task.id!, null, antikythera.v1.TaskState.TASK_STATE_FAILED);
            return;
        }

        // Create Execution Context
        const context = new ExecutionContext();
        this.activeContexts.set(task.id!, context);

        try {
            // Create Task instance
            const taskInstance = new Task(task);

            // Invoke tool
            console.log(`Invoking ${agent.type}.${toolName} for task ${task.id}`);
            const result = await agent[toolName](taskInstance, context);

            // If cancelled, we might not want to report success
            if (context.isCancelled) {
                console.log(`Task ${task.id} cancelled. Skipping completion message.`);
                return;
            }

            // Complete task
            this.completeTask(task.id!, result, antikythera.v1.TaskState.TASK_STATE_SUCCEEDED);

        } catch (error: any) {
            if (context.isCancelled) {
                console.log(`Task ${task.id} cancelled during exception handling.`);
                return;
            }
            console.error(`Error executing task ${task.id}:`, error);
            this.completeTask(task.id!, null, antikythera.v1.TaskState.TASK_STATE_FAILED);
        } finally {
            this.activeContexts.delete(task.id!);
        }
    }

    protected completeTask(taskId: string, outputs: any, state: TaskState) {
        console.log(`Completing task ${taskId} with state ${state}`);

        // Convert outputs to AnyData map
        // For now, we assume outputs is a simple object { key: value } where value is string/number/bool
        const outputMap: { [k: string]: compas_pb.data.IAnyData } = {};

        if (outputs && typeof outputs === 'object') {
            for (const [key, val] of Object.entries(outputs)) {
                outputMap[key] = this.createAnyData(val);
            }
        }

        const completion: TaskCompletionMessage = {
            id: taskId,
            state: state,
            agentId: this.agentId,
            outputs: outputMap,
            timestamp: { seconds: Math.floor(Date.now() / 1000) } as any
        };

        const innerBuffer = antikythera.v1.TaskCompletionMessage.encode(completion).finish();
        const buffer = this.wrapMessage(innerBuffer, 'type.googleapis.com/antikythera.v1.TaskCompletionMessage');

        this.mqttService.publish('antikythera/task/completed', buffer);
        this.activeTasks.delete(taskId);
    }

    private createAnyData(val: any): compas_pb.data.IAnyData {
        // Simple encoding for primitive types
        if (typeof val === 'string') {
            return { value: { stringValue: val } };
        } else if (typeof val === 'number') {
            return { value: { numberValue: val } };
        } else if (typeof val === 'boolean') {
            return { value: { boolValue: val } };
        }
        // Fallback for null or unknown
        return { value: { nullValue: 0 } };
    }

    public dispose() {
        console.log(`Disposing Agent Launcher ${this.agentId}`);
        if (this.messageHandlerCleanup) {
            this.messageHandlerCleanup();
        }
    }
}

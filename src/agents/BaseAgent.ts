import { MqttService } from '../services/MqttService';
import { antikythera, google, compas_pb } from '../proto/bundle';

// Type aliases for convenience
type TaskAssignmentMessage = antikythera.v1.ITaskAssignmentMessage;
type TaskClaimRequest = antikythera.v1.ITaskClaimRequest;
type TaskAllocationMessage = antikythera.v1.ITaskAllocationMessage;
type TaskCompletionMessage = antikythera.v1.ITaskCompletionMessage;
type TaskState = antikythera.v1.TaskState;

export abstract class BaseAgent {
  protected mqttService: MqttService;
  protected agentId: string;
  protected agentType: string;
  protected pendingClaims: Map<string, TaskAssignmentMessage> = new Map();
  protected activeTasks: Map<string, TaskAssignmentMessage> = new Map();
  protected isDisposed: boolean = false;
  private messageHandlerCleanup: (() => void) | undefined;

  constructor(agentType: string, mqttService: MqttService) {
    this.agentType = agentType;
    this.agentId = `frontend-agent-${Math.random().toString(36).substring(7)}`;
    this.mqttService = mqttService;

    console.log(`Initializing agent ${this.agentId} of type ${this.agentType}`);

    // Register message handler
    this.messageHandlerCleanup = this.mqttService.onMessage(this.onMessage.bind(this));

    // Subscribe to topics
    this.initializeSubscriptions();
  }

  protected async initializeSubscriptions() {
    await this.mqttService.subscribe('antikythera/task/start');
    await this.mqttService.subscribe('antikythera/task/allocation');
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
          console.warn('Failed to unwrap/decode task, attempting direct decode (fallback)');
          task = antikythera.v1.TaskAssignmentMessage.decode(uint8Message);
        }

        this.handleTaskStart(task);

      } else if (topic === 'antikythera/task/allocation') {
        let allocation: TaskAllocationMessage | null = null;

        const anyMsg = this.unwrapMessage(uint8Message);
        if (anyMsg) {
          if (anyMsg.type_url === 'type.googleapis.com/antikythera.v1.TaskAllocationMessage') {
            allocation = antikythera.v1.TaskAllocationMessage.decode(anyMsg.value as Uint8Array);
          }
        }

        if (!allocation) {
          allocation = antikythera.v1.TaskAllocationMessage.decode(uint8Message);
        }

        this.handleTaskAllocation(allocation);
      }
    } catch (err) {
      console.error('Error processing message:', err);
    }
  }

  private unwrapMessage(uint8Message: Uint8Array): google.protobuf.IAny | null {
    // 1. Try compas_pb.data.MessageData
    try {
      const msgData = compas_pb.data.MessageData.decode(uint8Message);
      // Check if it looks valid (has version or data)
      if (msgData.version || msgData.data) {
        if (msgData.data && msgData.data.message) {
          return msgData.data.message;
        }
      }
    } catch (e) {
      // Not MessageData
    }

    // 2. Try compas_pb.data.AnyData
    try {
      const anyData = compas_pb.data.AnyData.decode(uint8Message);
      if (anyData.message) {
        return anyData.message;
      }
    } catch (e) {
      // Not AnyData
    }

    // 3. Try google.protobuf.Any
    try {
      const anyMsg = google.protobuf.Any.decode(uint8Message);
      // Check if type_url looks sane (starts with type.googleapis.com)
      if (anyMsg.type_url && anyMsg.type_url.startsWith('type.googleapis.com/')) {
        return anyMsg;
      }
    } catch (e) {
      // Not Any
    }

    return null;
  }

  private wrapMessage(messageBytes: Uint8Array, typeUrl: string): Uint8Array {
    // 1. Wrap in Any
    const anyMsg = google.protobuf.Any.create({
      type_url: typeUrl,
      value: messageBytes
    });

    // 2. Wrap in AnyData
    const anyData = compas_pb.data.AnyData.create({
      message: anyMsg
    });

    // 3. Wrap in MessageData
    const msgData = compas_pb.data.MessageData.create({
      version: '0.4.6', // Hardcoded version matching backend expectation
      data: anyData
    });

    // 4. Encode to bytes
    return compas_pb.data.MessageData.encode(msgData).finish();
  }

  protected handleTaskStart(task: TaskAssignmentMessage) {
    if (task.type === this.agentType) {
      console.log(`Task ${task.id} matches agent type ${this.agentType}. Claiming...`);
      this.pendingClaims.set(task.id!, task);

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

  protected handleTaskAllocation(allocation: TaskAllocationMessage) {
    if (allocation.assignedAgentId === this.agentId) {
      const taskId = allocation.taskId!;
      const task = this.pendingClaims.get(taskId);

      if (task) {
        console.log(`Task ${taskId} allocated to me. Executing...`);
        this.pendingClaims.delete(taskId);
        this.activeTasks.set(taskId, task);
        this.executeTask(task);
      } else {
        console.warn(`Task ${taskId} allocated but not found in pending claims.`);
      }
    }
  }

  protected completeTask(taskId: string, outputs: any, state: TaskState = antikythera.v1.TaskState.TASK_STATE_SUCCEEDED) {
    console.log(`Completing task ${taskId}`);

    // Convert outputs to AnyData map if needed, for now assuming simple structure or handling in subclass
    // In a real implementation, we'd need to properly encode the outputs into compas_pb.data.AnyData

    const completion: TaskCompletionMessage = {
      id: taskId,
      state: state,
      agentId: this.agentId,
      outputs: outputs, // This needs proper encoding in a full implementation
      timestamp: { seconds: Math.floor(Date.now() / 1000) } as any
    };

    const innerBuffer = antikythera.v1.TaskCompletionMessage.encode(completion).finish();
    const buffer = this.wrapMessage(innerBuffer, 'type.googleapis.com/antikythera.v1.TaskCompletionMessage');

    this.mqttService.publish('antikythera/task/completed', buffer);
    console.log(`Published completion for task ${taskId}`);
    this.activeTasks.delete(taskId);
  }

  protected abstract executeTask(task: TaskAssignmentMessage): void;

  public dispose() {
    console.log(`Disposing agent ${this.agentId}`);
    this.isDisposed = true;
    if (this.messageHandlerCleanup) {
      this.messageHandlerCleanup();
    }
  }
}

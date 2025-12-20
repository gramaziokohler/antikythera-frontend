import { BaseAgent } from './BaseAgent';
import { MqttService } from '../services/MqttService';
import { antikythera, compas_pb } from '../proto/bundle';

export interface UserPromptOptions {
    message: string;
    options: string[];
}

export class UserPromptAgent extends BaseAgent {
    private onPromptCallback: (taskId: string, options: UserPromptOptions) => void;

    constructor(mqttService: MqttService, onPrompt: (taskId: string, options: UserPromptOptions) => void) {
        super('user_prompt.confirm', mqttService);
        this.onPromptCallback = onPrompt;
    }

    protected executeTask(task: antikythera.v1.ITaskAssignmentMessage): void {
        let message = "Please confirm";
        let options = ["OK", "Cancel"];

        if (task.params) {
            // Extract message
            if (task.params['message']) {
                const val = this.extractValue(task.params['message']);
                if (typeof val === 'string') {
                    message = val;
                }
            }

            // Extract options
            if (task.params['options']) {
                const val = this.extractValue(task.params['options']);
                if (Array.isArray(val)) {
                    options = val;
                }
            }
        }

        console.log(`Prompting user for task ${task.id}: ${message} [${options.join(', ')}]`);
        this.onPromptCallback(task.id!, { message, options });
    }

    private extractValue(anyData: compas_pb.data.IAnyData): any {
        if (anyData.value) {
            // It's a google.protobuf.Value
            // We need to handle the different kinds (null, number, string, bool, struct, list)
            // But IValue interface in bundle.d.ts might be tricky.
            // Let's assume it's a simple value for now or check properties.
            // In protobufjs, Value usually has one of the fields set.
            const v = anyData.value;
            if (v.stringValue !== undefined && v.stringValue !== null) return v.stringValue;
            if (v.numberValue !== undefined && v.numberValue !== null) return v.numberValue;
            if (v.boolValue !== undefined && v.boolValue !== null) return v.boolValue;
            // ... handle listValue and structValue if needed
        } else if (anyData.message) {
            // It's an Any
            const typeUrl = anyData.message.type_url;
            const value = anyData.message.value;
            
            if (typeUrl === 'type.googleapis.com/compas_pb.data.ListData') {
                const listData = compas_pb.data.ListData.decode(value as Uint8Array);
                return listData.items?.map(item => this.extractValue(item));
            }
            // Handle other types if needed
        }
        return null;
    }

    public resolvePrompt(taskId: string, result: string) {
        // Encode the result string into AnyData
        // We'll use google.protobuf.Value for simplicity
        const outputData: { [k: string]: compas_pb.data.IAnyData } = {
            "result": {
                value: {
                    stringValue: result
                }
            }
        };
        
        this.completeTask(taskId, outputData);
    }
}

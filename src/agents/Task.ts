import { antikythera, compas_pb } from '../proto/bundle';
import { decodeAnyData } from './anyDataCodec';

export class Task {
    private _message: antikythera.v1.ITaskAssignmentMessage;

    constructor(message: antikythera.v1.ITaskAssignmentMessage) {
        this._message = message;
    }

    get id(): string {
        return this._message.id || '';
    }

    get type(): string {
        return this._message.type || '';
    }

    get params(): any {
        return this.extractMap(this._message.params);
    }

    /**
     * The task's params, undecoded. Lets a caller (see SimulationAgent) forward a param's wire
     * value byte-for-byte instead of decoding and re-encoding it — needed because a param isn't
     * necessarily FallbackData/DictData/a primitive by the time it arrives; compas_pb may have
     * serialized it using a native message type this frontend has no reason to understand (see
     * anyDataCodec.ts's AnyDataPassthrough).
     */
    getRawParams(): { [k: string]: compas_pb.data.IAnyData } {
        return this._message.params ?? {};
    }

    get inputs(): any {
        return this.extractMap(this._message.inputs);
    }

    get context(): any {
        return this.extractMap(this._message.context);
    }

    // Force recompile
    public toJSON() {
        return {
            id: this.id,
            type: this.type,
            inputs: this.inputs,
            params: this.params,
            context: this.context
        };
    }

    private extractMap(map: { [k: string]: compas_pb.data.IAnyData } | null | undefined): any {
        if (!map) return {};
        const result: any = {};
        for (const [key, value] of Object.entries(map)) {
            if (value) {
                result[key] = this.extractValue(value);
            }
        }
        return result;
    }

    private extractValue(anyData: compas_pb.data.IAnyData): any {
        return decodeAnyData(anyData);
    }
}

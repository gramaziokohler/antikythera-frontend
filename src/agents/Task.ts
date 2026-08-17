import { antikythera, compas_pb } from '../proto/bundle';
import { decodeMap } from './compasPb';

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
     * compasPb.ts's AnyDataPassthrough).
     */
    getRawParams(): { [k: string]: compas_pb.data.IAnyData } {
        return this._message.params ?? {};
    }

    /**
     * The names of the outputs this task declares in its blueprint (the orchestrator's
     * `output_keys`, see `outputs_to_keys`). Empty for a task that declares none — which is not
     * the same thing as a task whose outputs simply have no value yet, a distinction the
     * simulation stand-in depends on (see SimulationAgent).
     */
    get outputKeys(): string[] {
        return this._message.outputKeys ?? [];
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
        return map ? decodeMap(map) : {};
    }
}

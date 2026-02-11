import { antikythera, compas_pb } from '../proto/bundle';

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
        if (anyData.value) {
            const v = anyData.value;
            if (v.stringValue !== undefined && v.stringValue !== null) return v.stringValue;
            if (v.numberValue !== undefined && v.numberValue !== null) return v.numberValue;
            if (v.boolValue !== undefined && v.boolValue !== null) return v.boolValue;
            // TODO: Handle listValue and structValue recursively if needed
        } else if (anyData.message) {
            const typeUrl = anyData.message.type_url;
            const value = anyData.message.value;

            if (typeUrl === 'type.googleapis.com/compas_pb.data.ListData') {
                const listData = compas_pb.data.ListData.decode(value as Uint8Array);
                return listData.items?.map(item => this.extractValue(item));
            }
        }
        return null;
    }
}

export type CancelCallback = () => void;

export class ExecutionContext {
    private _isCancelled: boolean = false;
    private _callbacks: CancelCallback[] = [];

    /**
     * Returns true if the task has been requested to cancel.
     */
    public get isCancelled(): boolean {
        return this._isCancelled;
    }

    /**
     * Marks the context as cancelled and executes all registered callbacks.
     * This method is called by the runtime/manager, not by the tool itself.
     */
    public cancel(): void {
        if (this._isCancelled) {
            return;
        }
        this._isCancelled = true;

        // Execute callbacks
        for (const callback of this._callbacks) {
            try {
                callback();
            } catch (e) {
                console.error("[ExecutionContext] Error in onCancel callback:", e);
            }
        }
    }

    /**
     * Register a callback to be executed when the task is cancelled.
     * Useful for cleaning up external resources (sockets, file handles).
     * 
     * If the context is already cancelled, the callback is executed immediately.
     */
    public onCancel(callback: CancelCallback): void {
        if (this._isCancelled) {
            try {
                callback();
            } catch (e) {
                console.error("[ExecutionContext] Error in onCancel callback (immediate):", e);
            }
        } else {
            this._callbacks.push(callback);
        }
    }
}

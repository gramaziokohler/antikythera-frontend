import { useEffect, useRef } from 'react';
import { RotateCcw, CornerDownRight } from 'lucide-react';
import './NodeContextMenu.css';

export interface NodeContextMenuProps {
    /** Screen position for the menu */
    x: number;
    y: number;
    /** The task node that was right-clicked */
    nodeId: string;
    nodeStatus: string;
    nodeType: string;
    /** Whether the session is active (has a sessionId) */
    hasSession: boolean;
    /** Callbacks */
    onResetTask: (nodeId: string, includeDownstream: boolean) => void;
    onClose: () => void;
}

export function NodeContextMenu({
    x,
    y,
    nodeId,
    nodeStatus,
    nodeType,
    hasSession,
    onResetTask,
    onClose,
}: NodeContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);

    // Close on click-outside or Escape
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as HTMLElement)) {
                onClose();
            }
        };
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('mousedown', handleClick);
        document.addEventListener('keydown', handleKey);
        return () => {
            document.removeEventListener('mousedown', handleClick);
            document.removeEventListener('keydown', handleKey);
        };
    }, [onClose]);

    // Clamp position so the menu doesn't overflow the viewport
    useEffect(() => {
        if (!menuRef.current) return;
        const rect = menuRef.current.getBoundingClientRect();
        const el = menuRef.current;
        if (rect.right > window.innerWidth) {
            el.style.left = `${x - rect.width}px`;
        }
        if (rect.bottom > window.innerHeight) {
            el.style.top = `${y - rect.height}px`;
        }
    }, [x, y]);

    const status = nodeStatus?.toLowerCase();
    const isStartOrEnd = ['system.start', 'system.end'].includes(nodeType?.toLowerCase?.() || '');
    const isResettable = ['succeeded', 'completed', 'failed', 'skipped', 'running', 'ready'].includes(status);
    const canReset = hasSession && isResettable && !isStartOrEnd;

    return (
        <div
            ref={menuRef}
            className="node-context-menu"
            style={{ top: y, left: x }}
        >
            <div className="context-menu-header">
                <span className="context-menu-node-id">{nodeId}</span>
                <span className={`context-menu-status ${status}`}>{nodeStatus}</span>
            </div>

            <div className="context-menu-divider" />

            <button
                className="context-menu-item"
                disabled={!canReset}
                onClick={() => { onResetTask(nodeId, false); }}
            >
                <RotateCcw size={14} />
                <span>Reset this task</span>
            </button>

            <button
                className="context-menu-item"
                disabled={!canReset}
                onClick={() => { onResetTask(nodeId, true); }}
            >
                <CornerDownRight size={14} />
                <span>Reset with downstream</span>
            </button>

            {!hasSession && (
                <>
                    <div className="context-menu-divider" />
                    <div className="context-menu-hint">Start a session to enable task actions</div>
                </>
            )}

            {hasSession && isStartOrEnd && (
                <>
                    <div className="context-menu-divider" />
                    <div className="context-menu-hint">Start/End tasks cannot be reset</div>
                </>
            )}

            {hasSession && !isResettable && !isStartOrEnd && (
                <>
                    <div className="context-menu-divider" />
                    <div className="context-menu-hint">Task is already pending</div>
                </>
            )}
        </div>
    );
}

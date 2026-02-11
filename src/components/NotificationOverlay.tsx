import { useState, useEffect } from 'react';
import { Info, CheckCircle, AlertTriangle, XCircle, X } from 'lucide-react';
import '../styles/NotificationOverlay.css';

/**
 * Interface definition for a notification object.
 */
export interface Notification {
    id: string;
    title?: string;
    message: string;
    level: 'info' | 'success' | 'warning' | 'error';
    timestamp: number;
}

/**
 * Props for the NotificationOverlay component.
 */
interface NotificationOverlayProps {
    /**
     * Array of active notifications to display.
     */
    notifications: Notification[];
    /**
     * Callback to dismiss a notification by ID.
     */
    onDismiss: (id: string) => void;
}

const NotificationIcon = ({ level }: { level: Notification['level'] }) => {
    switch (level) {
        case 'success':
            return <CheckCircle className="notification-icon-success" size={20} />;
        case 'warning':
            return <AlertTriangle className="notification-icon-warning" size={20} />;
        case 'error':
            return <XCircle className="notification-icon-error" size={20} />;
        default:
            return <Info className="notification-icon-info" size={20} />;
    }
};

const TimeAgo = ({ timestamp }: { timestamp: number }) => {
    const [timeAgo, setTimeAgo] = useState<string>('just now');

    useEffect(() => {
        const updateTime = () => {
            const seconds = Math.floor((Date.now() - timestamp) / 1000);

            if (seconds < 60) {
                setTimeAgo('just now');
            } else if (seconds < 3600) {
                const minutes = Math.floor(seconds / 60);
                setTimeAgo(`${minutes}m ago`);
            } else if (seconds < 86400) {
                const hours = Math.floor(seconds / 3600);
                setTimeAgo(`${hours}h ago`);
            } else {
                const days = Math.floor(seconds / 86400);
                setTimeAgo(`${days}d ago`);
            }
        };

        updateTime();
        const interval = setInterval(updateTime, 60000); // Update every minute

        return () => clearInterval(interval);
    }, [timestamp]);

    return (
        <span className="notification-time" title={new Date(timestamp).toLocaleString()}>
            {timeAgo}
        </span>
    );
};

interface NotificationItemProps {
    notification: Notification;
    onDismiss: (id: string) => void;
}

const NotificationItem = ({ notification, onDismiss }: NotificationItemProps) => {
    const [translateX, setTranslateX] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [isRemoving, setIsRemoving] = useState(false);
    const [startX, setStartX] = useState(0);

    const handlePointerDown = (e: React.PointerEvent) => {
        // Ignore clicks on the close button
        if ((e.target as HTMLElement).closest('.notification-close')) return;

        setIsDragging(true);
        setStartX(e.clientX);
        (e.target as Element).setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging) return;

        const currentX = e.clientX;
        const diff = currentX - startX;

        // Only allow dragging to the right (positive X)
        if (diff > 0) {
            setTranslateX(diff);
        } else {
            // Resistance when dragging left
            setTranslateX(diff * 0.2);
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (!isDragging) return;
        setIsDragging(false);
        (e.target as Element).releasePointerCapture(e.pointerId);

        // Threshold to dismiss (e.g. 100px)
        if (translateX > 100) {
            setIsRemoving(true);
            // Continue animation off-screen then dismiss
            setTranslateX(500);
            setTimeout(() => onDismiss(notification.id), 200);
        } else {
            // Snap back
            setTranslateX(0);
        }
    };

    return (
        <div
            className={`notification-toast ${notification.level} ${isRemoving ? 'removing' : ''}`}
            role="alert"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{
                transform: `translateX(${translateX}px)`,
                opacity: isRemoving ? 0 : 1 - (Math.max(0, translateX) / 300),
                cursor: isDragging ? 'grabbing' : 'grab',
                touchAction: 'none',
                transition: isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.2s',
                userSelect: 'none'
            }}
        >
            <div className="notification-icon-wrapper">
                <NotificationIcon level={notification.level} />
            </div>

            <div className="notification-content">
                {notification.title && (
                    <h4 className="notification-title">
                        {notification.title}
                    </h4>
                )}
                <p className="notification-message">{notification.message}</p>
                <TimeAgo timestamp={notification.timestamp} />
            </div>

            <button
                className="notification-close"
                onClick={() => onDismiss(notification.id)}
                aria-label="Dismiss notification"
                onPointerDown={(e) => e.stopPropagation()}
            >
                <X size={16} />
            </button>

            <div className="notification-progress"></div>
        </div>
    );
};

export function NotificationOverlay({ notifications, onDismiss }: NotificationOverlayProps) {
    if (notifications.length === 0) {
        return null;
    }

    return (
        <div className="notification-container">
            {notifications.map((notification) => (
                <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onDismiss={onDismiss}
                />
            ))}
        </div>
    );
}

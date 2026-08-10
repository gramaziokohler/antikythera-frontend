import { LogOut, User } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';

interface UserBadgeProps {
  collapsed?: boolean;
}

/**
 * Shows the logged-in user's email and a logout button when the optional auth
 * layer is active. Renders nothing when auth is disabled (the /whoami endpoint
 * reports `authenticated: false` because oauth2-proxy is not in front), so the
 * no-auth deployment is visually unchanged.
 */
export function UserBadge({ collapsed }: UserBadgeProps) {
  const { mode, identity, signOut } = useAuth();
  if (mode !== 'authenticated' || !identity) return null;

  const label = identity.email || identity.user || 'Signed in';

  return (
    <div
      className="user-badge"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 8px',
        color: 'var(--color-text-secondary)',
        fontSize: '12px',
        minWidth: 0,
      }}
      title={label}
    >
      <User size={14} style={{ flexShrink: 0 }} />
      {!collapsed && (
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>
      )}
      <button
        type="button"
        onClick={signOut}
        title="Sign out"
        style={{ display: 'flex', alignItems: 'center', color: 'inherit', marginLeft: 'auto', flexShrink: 0, border: 0, padding: 0, background: 'none' }}
      >
        <LogOut size={14} />
      </button>
    </div>
  );
}

import { useState, useEffect } from 'react'
import { UserPromptDialog } from './components/UserPromptDialog'
import { MqttService } from './services/MqttService'
import { AgentLauncher } from './agents/AgentLauncher'
import { BlueprintBackground } from './components/BlueprintBackground'

import './styles/layout.css'
import './styles/components.css'

function AgentApp() {
    // We can also display connection status here
    const [connected, setConnected] = useState(false)
    const [clientId, setClientId] = useState<string>('')
    const [theme, setTheme] = useState<'light' | 'dark'>(() => {
        const saved = localStorage.getItem('agent-theme');
        return (saved === 'dark' || saved === 'light') ? saved : 'light';
    });

    // Save theme selection
    useEffect(() => {
        localStorage.setItem('agent-theme', theme);
    }, [theme]);

    // Initialize/Check connection
    useEffect(() => {
        // Just ensure service exists, UserPromptDialog will register the agent
        const service = MqttService.getInstance();
        const agentLauncher = AgentLauncher.getInstance(service);
        setClientId(agentLauncher.getAgentId());
    }, []);

    const toggleTheme = () => {
        setTheme(prev => prev === 'light' ? 'dark' : 'light');
    };

    const styles = {
        app: {
            color: theme === 'light' ? '#5d4037' : '#f5f5f5',
        },
        statusParams: {
            color: theme === 'light' ? '#2e7d32' : '#ffffff', // White in dark mode
        },
        idParams: {
            color: theme === 'light' ? '#8d6e63' : '#6b6b6b', // Grey in dark mode
        },
        instruction: {
            color: theme === 'light' ? '#d2691e' : '#ffffff', // White in dark mode
        },
        toggleBtn: {
            background: 'transparent',
            border: 'none',
            color: theme === 'light' ? '#5d4037' : '#f5f5f5',
            padding: '0.5rem',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: '1.2rem',
            transition: 'all 0.3s ease',
            opacity: 0.7
        }
    };

    return (
        <div className="agent-app-shell" data-theme={theme} style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            color: styles.app.color,
            fontFamily: "'Inconsolata', monospace",
            position: 'relative',
            overflow: 'hidden'
        }}>
            <BlueprintBackground theme={theme} />

            {/* Theme Toggle */}
            <div style={{
                position: 'absolute',
                top: '2rem',
                left: '2rem',
                zIndex: 10
            }}>
                <button
                    onClick={toggleTheme}
                    style={styles.toggleBtn}
                    onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
                    onMouseOut={(e) => e.currentTarget.style.opacity = '0.7'}
                >
                    {theme === 'light' ? '☾' : '☀'}
                </button>
            </div>

            {/* Top Right Info */}
            <div style={{
                position: 'absolute',
                top: '2rem',
                right: '2rem',
                textAlign: 'right',
                zIndex: 10,
                fontSize: '0.85rem'
            }}>
                <div style={{ color: styles.statusParams.color, marginBottom: '0.25rem', fontWeight: 600 }}>STATUS: ONLINE</div>
                <div style={{ color: styles.idParams.color, fontFamily: 'monospace' }}>ID: {clientId}</div>
            </div>

            <div className="status-indicator" style={{ zIndex: 10, marginBottom: '2rem' }}>
                <p style={{ letterSpacing: '0.05em', color: styles.instruction.color, fontSize: '1.2rem' }}>// AWAITING INSTRUCTIONS...</p>
            </div>

            {/* This component handles the actual agent logic and UI popup */}
            <div style={{ position: 'relative', zIndex: 50 }}>
                <UserPromptDialog />
            </div>
        </div>
    )
}

export default AgentApp

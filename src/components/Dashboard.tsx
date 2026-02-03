import { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertCircle,
  Clock,
  Zap,
  TrendingUp,
  FileText,
  Box,
  ArrowRight,
  Play,
  Upload
} from 'lucide-react';
import '../styles/Dashboard.css';

interface DashboardStats {
  totalBlueprints: number;
  activeSessions: number;
  completedSessions: number;
  failedSessions: number;
  totalTasks: number;
  successRate: number;
  avgSessionDuration: string;
  recentSessions: Array<{
    id: string;
    blueprintName: string;
    status: 'running' | 'completed' | 'failed';
    startedAt: string;
    duration?: string;
  }>;
  recentBlueprints: Array<{
    id: string;
    name: string;
    uploadedAt: string;
    taskCount: number;
  }>;
}

export function Dashboard() {
  const [stats] = useState<DashboardStats>({
    totalBlueprints: 24,
    activeSessions: 3,
    completedSessions: 156,
    failedSessions: 12,
    totalTasks: 1247,
    successRate: 92.9,
    avgSessionDuration: '4m 32s',
    recentSessions: [
      { id: 'sess-001', blueprintName: 'Structural Analysis Pipeline', status: 'running', startedAt: '2 minutes ago' },
      { id: 'sess-002', blueprintName: 'Geometry Optimization', status: 'completed', startedAt: '15 minutes ago', duration: '3m 45s' },
      { id: 'sess-003', blueprintName: 'Mesh Generation', status: 'failed', startedAt: '1 hour ago', duration: '2m 12s' },
      { id: 'sess-004', blueprintName: 'Data Processing', status: 'completed', startedAt: '2 hours ago', duration: '5m 20s' },
    ],
    recentBlueprints: [
      { id: 'bp-001', name: 'Point Cloud Processor', uploadedAt: 'Today, 9:30 AM', taskCount: 5 },
      { id: 'bp-002', name: 'BIM Validation', uploadedAt: 'Yesterday, 4:15 PM', taskCount: 8 },
      { id: 'bp-003', name: 'Fabrication Export', uploadedAt: 'Yesterday, 2:00 PM', taskCount: 3 },
    ]
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running': return <Activity size={16} className="status-icon running" />;
      case 'completed': return <CheckCircle2 size={16} className="status-icon completed" />;
      case 'failed': return <AlertCircle size={16} className="status-icon failed" />;
      default: return null;
    }
  };

  const getStatusClass = (status: string) => `status-badge ${status}`;

  return (
    <div className="dashboard-container">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-content">
          <span className="hero-eyebrow">Antikythera Orchestration Platform</span>
          <h1 className="hero-title">
            <span className="hero-line">Design blueprints.</span>
            <span className="hero-line">Deploy anywhere.</span>
          </h1>
          <p className="hero-subtitle">
            Manage distributed fabrication blueprints, monitor execution sessions,
            and track progress in real-time.
          </p>
          <div className="hero-actions">
            <button className="hero-btn primary">
              <Play size={18} />
              Start Session
            </button>
            <button className="hero-btn secondary">
              <Upload size={18} />
              Upload Blueprint
            </button>
          </div>
        </div>
        <div className="hero-visual">
          <div className="hero-stat-card">
            <div className="hero-stat-header">
              <TrendingUp size={20} />
              <span>Performance</span>
            </div>
            <div className="hero-stat-value">{stats.successRate}%</div>
            <div className="hero-stat-label">Success Rate</div>
            <div className="hero-stat-trend positive">+3.2% this week</div>
          </div>
        </div>
      </section>

      {/* Quick Stats Grid */}
      <section className="stats-section">
        <div className="stat-card">
          <div className="stat-icon blue">
            <FileText size={22} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{stats.totalBlueprints}</span>
            <span className="stat-label">Total Blueprints</span>
          </div>
        </div>

        <div className="stat-card highlight">
          <div className="stat-icon green">
            <Activity size={22} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{stats.activeSessions}</span>
            <span className="stat-label">Active Sessions</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon purple">
            <CheckCircle2 size={22} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{stats.completedSessions}</span>
            <span className="stat-label">Completed</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon orange">
            <Zap size={22} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{stats.totalTasks}</span>
            <span className="stat-label">Tasks Executed</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon red">
            <AlertCircle size={22} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{stats.failedSessions}</span>
            <span className="stat-label">Failed</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon teal">
            <Clock size={22} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{stats.avgSessionDuration}</span>
            <span className="stat-label">Avg. Duration</span>
          </div>
        </div>
      </section>

      {/* Main Content Grid */}
      <section className="content-grid">
        {/* Recent Sessions */}
        <div className="panel sessions-panel">
          <div className="panel-header">
            <h2>Recent Sessions</h2>
            <button className="view-all-btn">
              View All <ArrowRight size={16} />
            </button>
          </div>
          <div className="sessions-list">
            {stats.recentSessions.map((session) => (
              <div key={session.id} className="session-item">
                <div className="session-info">
                  {getStatusIcon(session.status)}
                  <div className="session-details">
                    <span className="session-name">{session.blueprintName}</span>
                    <span className="session-meta">Started {session.startedAt}</span>
                  </div>
                </div>
                <div className="session-status">
                  <span className={getStatusClass(session.status)}>
                    {session.status}
                  </span>
                  {session.duration && (
                    <span className="session-duration">{session.duration}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Blueprints */}
        <div className="panel blueprints-panel">
          <div className="panel-header">
            <h2>Recent Blueprints</h2>
            <button className="view-all-btn">
              View All <ArrowRight size={16} />
            </button>
          </div>
          <div className="blueprints-list">
            {stats.recentBlueprints.map((blueprint) => (
              <div key={blueprint.id} className="blueprint-item">
                <div className="blueprint-icon">
                  <Box size={20} />
                </div>
                <div className="blueprint-details">
                  <span className="blueprint-name">{blueprint.name}</span>
                  <span className="blueprint-meta">
                    {blueprint.taskCount} tasks • {blueprint.uploadedAt}
                  </span>
                </div>
                <button className="blueprint-action">
                  <Play size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

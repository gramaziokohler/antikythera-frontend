import { Activity, CheckCircle, AlertCircle } from 'lucide-react';
import '../styles/Dashboard.css';

export function Dashboard() {
  return (
    <div className="dashboard-container">
      <header className="page-header">
        <h1>Dashboard</h1>
        <p className="subtitle">Overview of your computation nodes and recent activity.</p>
      </header>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon success">
            <CheckCircle size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-value">12</span>
            <span className="stat-label">Completed Sessions</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon active">
            <Activity size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-value">2</span>
            <span className="stat-label">Running Tasks</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon warning">
            <AlertCircle size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-value">1</span>
            <span className="stat-label">Failed Sessions</span>
          </div>
        </div>
      </div>

      <div className="recent-activity">
        <h2>Recent Activity</h2>
        <div className="activity-list placeholder-content">
          <p>Activity feed coming soon...</p>
        </div>
      </div>
    </div>
  );
}

import '../styles/Dashboard.css'; // Reusing dashboard styles for consistency
import { UploadModel } from './UploadModel';
import { ModelsList } from './ModelsList';

interface ArtifactsProps {
  apiBaseUrl?: string;
}

export function Artifacts({ apiBaseUrl = '/api' }: ArtifactsProps) {
  return (
    <div className="view-container">
      <header className="page-header">
        <h1><span className="title-first">Artifacts</span> <span className="title-rest">& Models</span></h1>
        <p className="subtitle">Manage uploaded models and data artifacts.</p>
      </header>

      <div className="content-grid">
        <div className="panel upload-panel">
          <UploadModel apiBaseUrl={apiBaseUrl} />
        </div>
        <div className="panel list-panel">
          <ModelsList apiBaseUrl={apiBaseUrl} />
        </div>
      </div>
    </div>
  );
}

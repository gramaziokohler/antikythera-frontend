export interface BlueprintInfo {
  id: string;
  name: string;
  version: string;
  description: string | null;
  task_count: number;
  uploaded_at: string;
}

export interface StartBlueprintRequest {
  blueprint_id: string;
  broker_host?: string;
  broker_port?: number;
  params?: Record<string, string>;
}

export interface StartBlueprintResponse {
  session_id: string;
  message: string;
}

export interface UploadBlueprintResponse {
  blueprint_id: string;
  message: string;
}

export interface UploadModelResponse {
  model_id: string;
  message: string;
}

export interface DeleteModelResponse {
  model_id: string;
  message: string;
}

export interface DeleteBlueprintResponse {
  blueprint_id: string;
  message: string;
}

export interface SessionActionResponse {
  session_id: string;
  message: string;
}

export interface SessionInfo {
  session_id: string;
  blueprint_id: string;
  broker_host: string;
  broker_port: number;
  started_at: string | null;
  ended_at: string | null;
  state: string;
}

export interface BlueprintDiagramResponse {
  session_id: string;
  diagram: string;
  state: string;
}

export interface SessionDataResponse {
  session_id: string;
  data: string;
  state: string;
}

export interface GraphNode {
  id: string;
  label: string;
  status: string;
  details?: string;
  type?: string;
  description?: string;
  inputs?: any[];
  outputs?: any[];
  internalBlueprintId?: string | null;
  condition?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface ScopeInfo {
  id: string;
  label: string;
  task_ids: string[];
  policy_type: 'skip' | 'retry' | 'while';
  policy: Record<string, any>;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  scopes?: ScopeInfo[];
}

export interface AntikytheraDependency {
  dtype: string;
  data: {
    id: string;
    type: string;
  };
  guid: string;
}

export interface TaskProperty {
  name: string;
  value: any;
  type?: string;
}

export interface AntikytheraTask {
  dtype: string;
  data: {
    id: string;
    type: string;
    description: string | null;
    state: string;
    depends_on: AntikytheraDependency[];
    inputs: TaskProperty[];
    params: TaskProperty[];
    outputs: TaskProperty[];
  };
  guid: string;
}

export interface AntikytheraBlueprint {
  dtype: string;
  data: {
    id: string;
    name: string;
    version: string;
    description: string | null;
    tasks: AntikytheraTask[];
  };
}

export interface SessionDetailsResponse {
  session_id: string;
  blueprint: AntikytheraBlueprint;
  state: string;
}



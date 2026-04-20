import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Play, Pause, Plus, RotateCcw, ChevronUp, ChevronDown, ChevronRight } from 'lucide-react'
import type { SessionDataResponse, GraphData } from '../types'
import { SessionGraph } from './SessionGraph'
import { StartSessionDialog } from './StartSessionDialog'
import { DataStoreExplorer } from './datastore/DataStoreExplorer'
import { NodeContextMenu } from './graph/NodeContextMenu'

interface SessionMonitorProps {
  apiBaseUrl: string
  sessionId?: string | null
  blueprintId?: string | null
  onClose: () => void
  onSessionCreated?: (sessionId: string) => void // New callback
}


// Removed old DataViewer and ValueRenderer components as they are replaced by DataStoreExplorer

// Command Pattern: Store operations to allow undo/sync
interface GraphCommand {
  type: 'SWAP_TASKS';
  nodeA: string;
  nodeB: string;
  timestamp: number;
}

export function SessionMonitor({ apiBaseUrl, sessionId, blueprintId, onClose, onSessionCreated }: SessionMonitorProps) {
  const [sessionData, setSessionData] = useState<SessionDataResponse | null>(null)
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [localBlueprint, setLocalBlueprint] = useState<any>(null)
  const [sessionState, setSessionState] = useState<string>('pending')
  const [mainBlueprintId, setMainBlueprintId] = useState<string>('Main Blueprint')
  const [error, setError] = useState<string | null>(null)
  const [commandHistory, setCommandHistory] = useState<GraphCommand[]>([])
  const [blueprintStack, setBlueprintStack] = useState<any[]>([])
  const [showStartDialog, setShowStartDialog] = useState(false)
  const [datastoreHeight, setDatastoreHeight] = useState(300)
  const [sessionParams, setSessionParams] = useState<any>(null)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string; nodeStatus: string; nodeType: string; scopeName: string | null } | null>(null)
  const [pollingKey, setPollingKey] = useState(0)
  const isResizingRef = useRef(false)
  const localBlueprintRef = useRef<any>(null);

  useEffect(() => {
    localBlueprintRef.current = localBlueprint;
  }, [localBlueprint]);

  useEffect(() => {
    if (commandHistory.length > 0) {
      console.log('Command History Updated:', commandHistory);
    }
  }, [commandHistory]);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const stopResizing = useCallback(() => {
    isResizingRef.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  const resize = useCallback((e: MouseEvent) => {
    if (isResizingRef.current) {
      // Docked at bottom, so dragging the top edge changes height based on distance from bottom
      const newHeight = window.innerHeight - e.clientY;
      // Min height 100px, max height 80% of window
      if (newHeight > 100 && newHeight < window.innerHeight * 0.8) {
        setDatastoreHeight(newHeight);
      }
    }
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResizing);
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [resize, stopResizing]);

  const transformBlueprintToGraph = useCallback((blueprint: any) => {
    // Handle potentially unwrapped blueprint
    const blueprintData = blueprint.data || blueprint;
    const tasks = blueprintData.tasks || [];

    const nodes = tasks.map((taskWrapper: any) => {
      let details = '';
      // Support both COMPAS-wrapped (dtype/data) and plain JSON tasks
      const taskData = taskWrapper.data || taskWrapper;
      const params = taskData.params;

      // Helper to extract value from a parameter object (handling COMPAS data wrapper)
      const getParamValue = (paramObj: any) => {
        if (!paramObj) return undefined;
        // Check inside 'data' if present (COMPAS wrapper where value is nested in data)
        if (paramObj.data && (paramObj.data.value !== undefined || paramObj.data.default !== undefined)) {
          return paramObj.data.value !== undefined ? paramObj.data.value : paramObj.data.default;
        }
        // Check direct properties
        return paramObj.value !== undefined ? paramObj.value : paramObj.default;
      };

      // Handle params which can be a list (strict) or map (legacy)
      let blueprintParamVal = undefined;
      if (Array.isArray(params)) {
        // 1. Try to find explicit 'blueprint' parameter
        // The name might be on the top object or inside .data
        const p = params.find((x: any) => (x.name === 'blueprint' || x.data?.name === 'blueprint'));
        if (p) {
          blueprintParamVal = getParamValue(p);
        }

        // 2. Fallback: Search for any parameter containing static/dynamic blueprint definition
        if (!blueprintParamVal) {
          const candidate = params.find((x: any) => {
            const v = getParamValue(x);
            return v && (v.static || v.dynamic || v.blueprint_id);
          });
          if (candidate) {
            blueprintParamVal = getParamValue(candidate);
          }
        }
      } else if (params && typeof params === 'object') {
        blueprintParamVal = params.blueprint;
      }

      // DEBUG: Log for composite tasks to diagnose missing ID
      if (taskData.type?.toLowerCase().includes('composite')) {
        console.log(`[DEBUG] Task ${taskData.id} params JSON:`, JSON.stringify(params));
        console.log(`[DEBUG] Extracted blueprintParamVal:`, blueprintParamVal);
      }

      let internalBlueprintId = null;
      if (blueprintParamVal) {
        if (typeof blueprintParamVal === 'string') {
          internalBlueprintId = blueprintParamVal;
          details = blueprintParamVal;
        } else if (blueprintParamVal.dynamic) {
          // Handle various dynamic blueprint formats
          if (blueprintParamVal.dynamic.blueprint_id) {
            internalBlueprintId = blueprintParamVal.dynamic.blueprint_id;
          } else if (blueprintParamVal.dynamic.element?.element_id) {
            internalBlueprintId = blueprintParamVal.dynamic.element.element_id;
          }
          details = internalBlueprintId || 'Dynamic';
        } else if (blueprintParamVal.static) {
          details = blueprintParamVal.static;
          internalBlueprintId = details;
        }
      }

      return {
        id: taskData.id,
        label: taskData.id,
        status: taskData.state || 'pending',
        details,
        // Pass additional data for TaskNode
        type: taskData.type,
        description: taskData.description,
        condition: taskData.condition,
        inputs: taskData.inputs,
        outputs: taskData.outputs,
        internalBlueprintId
      };
    })

    // Create a Set of valid node IDs for filtering edges
    const validNodeIds = new Set(nodes.map((n: any) => n.id));

    const edges = tasks.flatMap((taskWrapper: any) => {
      const taskData = taskWrapper.data || taskWrapper;
      const dependencies = taskData.depends_on || [];

      return dependencies.map((depWrapper: any) => {
        const depData = depWrapper.data || depWrapper;

        // Skip edges where source or target is missing from our node list
        if (!validNodeIds.has(depData.id)) {
          console.warn(`Skipping edge: Source node '${depData.id}' not found in blueprint tasks.`);
          return null;
        }
        if (!validNodeIds.has(taskData.id)) {
          console.warn(`Skipping edge: Target node '${taskData.id}' not found in blueprint tasks.`);
          return null;
        }

        return {
          source: depData.id,
          target: taskData.id
        };
      }).filter((e: any) => e !== null);
    })

    // Pass scope information through for visualization
    const scopes = (blueprintData.scopes || []).map((s: any) => {
      const scopeData = s.data || s;
      return {
        id: scopeData.id,
        label: scopeData.label || scopeData.id,
        task_ids: scopeData.task_ids || [],
        policy_type: scopeData.policy_type || 'skip',
        policy: scopeData.policy || {},
      };
    });

    return { nodes, edges, scopes };
  }, []);

  const parsedSessionData = useMemo(() => {
    if (!sessionData?.data) return null
    try {
      // If it's already an object, return it. If it's a string, parse it.
      return typeof sessionData.data === 'string' ? JSON.parse(sessionData.data) : sessionData.data
    } catch (e) {
      console.error('Failed to parse session data', e)
      return sessionData.data
    }
  }, [sessionData])

  useEffect(() => {
    // Only update from localBlueprint in preview mode. 
    // In session mode, graphData is updated directly from the fetch loop to avoid race conditions.
    if (localBlueprint && !sessionId) {
      setGraphData(transformBlueprintToGraph(localBlueprint));
    }
  }, [localBlueprint, transformBlueprintToGraph, sessionId]);

  const handleNodeSwap = (idA: string, idB: string) => {
    if (!localBlueprint) return

    // Validation
    const tasks = localBlueprint.data.tasks as any[];
    const taskA = tasks.find(t => t.data.id === idA);
    const taskB = tasks.find(t => t.data.id === idB);

    if (!taskA || !taskB) return;

    // Rule 4: Blueprint cannot be modified while the session is running
    // Only allow modification when paused or not yet started (pending/preview)
    const editableStates = ['paused', 'pending', 'preview'];
    if (sessionState && !editableStates.includes(sessionState.toLowerCase())) {
      console.warn(`Cannot modify blueprint while session is in state: ${sessionState}`);
      return;
    }

    // Rule 1: 'start' and 'end' are immutable
    const startEndIds = ['start', 'end'];
    if (startEndIds.includes(idA.toLowerCase()) || startEndIds.includes(idB.toLowerCase())) {
      console.warn('Cannot swap start or end nodes');
      return;
    }

    // Rule 2: Tasks that are running or finished cannot be swapped
    const immutableStates = ['started', 'running', 'completed', 'succeeded', 'failed', 'finished'];
    const isImmutable = (state: string | undefined) => state && immutableStates.includes(state.toLowerCase());

    if (isImmutable(taskA.data.state) || isImmutable(taskB.data.state)) {
      console.warn('Cannot swap tasks that are already started or finished');
      return;
    }

    setLocalBlueprint((prev: any) => {
      const newBlueprint = JSON.parse(JSON.stringify(prev)); // Deep copy
      const tasks = newBlueprint.data.tasks as any[];

      const indexA = tasks.findIndex(t => t.data.id === idA);
      const indexB = tasks.findIndex(t => t.data.id === idB);

      if (indexA === -1 || indexB === -1) return prev;

      const taskA = tasks[indexA];
      const taskB = tasks[indexB];

      // 1. Swap the depends_on lists (Topological swap)
      const tempDeps = taskA.data.depends_on;
      taskA.data.depends_on = taskB.data.depends_on;
      taskB.data.depends_on = tempDeps;

      // 2. Update all references in ALL tasks (including A and B)
      tasks.forEach(t => {
        t.data.depends_on.forEach((dep: any) => {
          if (dep.data.id === idA) {
            dep.data.id = idB;
          } else if (dep.data.id === idB) {
            dep.data.id = idA;
          }
        });
      });

      // 3. Swap the objects in the array (Physical list order swap)
      tasks[indexA] = taskB;
      tasks[indexB] = taskA;

      return newBlueprint;
    });

    // Valid swap: Store command
    setCommandHistory(prev => [...prev, {
      type: 'SWAP_TASKS',
      nodeA: idA,
      nodeB: idB,
      timestamp: Date.now()
    }]);

    // TODO: Transmit to backend
  };

  useEffect(() => {
    // If we only have a blueprint ID, fetch just the blueprint structure
    if (!sessionId && blueprintId) {
      const fetchBlueprint = async () => {
        try {
          const response = await fetch(`${apiBaseUrl}/blueprints/${blueprintId}`)
          if (response.ok) {
            const blueprint = await response.json()
            setLocalBlueprint(blueprint) // This will trigger the graph update via other useEffect
            setSessionState('preview')
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to fetch blueprint')
        }
      }
      fetchBlueprint()
      return
    }

    if (!sessionId) return

    const fetchData = async () => {
      try {
        const [dataResponse, sessionResponse] = await Promise.all([
          fetch(`${apiBaseUrl}/sessions/${sessionId}/data`),
          fetch(`${apiBaseUrl}/sessions/${sessionId}`)
        ])

        if (dataResponse.ok) {
          // used for viewing the data store
          const data: SessionDataResponse = await dataResponse.json()
          setSessionData(data)
        }

        if (sessionResponse.ok) {
          // used to follow the execution state. 
          const sessionDetails: any = await sessionResponse.json()

          // Handle COMPAS Data object structure
          const state = sessionDetails.data?.state || sessionDetails.state || 'pending'
          setSessionState(state)

          const params = sessionDetails.data?.params || sessionDetails.params || {}
          setSessionParams(params)

          // Extract main blueprint ID
          const bpId = sessionDetails.data?.blueprint?.data?.id || sessionDetails.blueprint?.id || 'Main Blueprint'
          setMainBlueprintId(bpId)

          // We use localBlueprint only for preview unless we want to support editing while running (not implemented)
          // For session, we fetch blueprint from session endpoint and transform it.

          // Determine target blueprint ID to preserve navigation depth (e.g. expanded inner blueprints)
          let fetchUrl = `${apiBaseUrl}/sessions/${sessionId}/blueprint`;
          // Use ref to get the current blueprint ID without breaking the closure or causing infinite loops
          const currentBlueprint = localBlueprintRef.current || localBlueprint;
          const currentId = currentBlueprint?.data?.id || currentBlueprint?.id;

          if (currentId) {
            fetchUrl = `${apiBaseUrl}/sessions/${sessionId}/blueprint/${currentId}`;
          }

          const blueprintResponse = await fetch(fetchUrl)
          if (blueprintResponse.ok) {
            const blueprint = await blueprintResponse.json()

            // Check if the user has navigated away while the fetch was in progress
            const activeBlueprint = localBlueprintRef.current;
            const activeId = activeBlueprint?.data?.id || activeBlueprint?.id;
            const fetchedId = blueprint?.data?.id || blueprint?.id;

            // Normalize comparison (handle potential differences or undefined initial state)
            // If we have an active ID and the fetched ID doesn't match, discard the update
            if (activeId && fetchedId && activeId !== fetchedId) {
              // console.log(`[DEBUG] Race condition detected. Ignoring update for ${fetchedId} as user is viewing ${activeId}`);
              return false;
            }

            setLocalBlueprint(blueprint) // Update local blueprint to support edits during pause
            setGraphData(transformBlueprintToGraph(blueprint))
          }

          // Stop polling if session has ended
          if (state && (
            state.toLowerCase() === 'completed' ||
            state.toLowerCase() === 'failed')) {
            return true // Signal to stop polling
          }
        }

        return false // Continue polling
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch session data')
        console.error(err)
        return false
      }
    };

    fetchData()
    const interval = setInterval(async () => {
      const shouldStop = await fetchData()
      if (shouldStop) {
        clearInterval(interval)
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [sessionId, blueprintId, apiBaseUrl, transformBlueprintToGraph, pollingKey])

  const handlePause = async () => {
    if (!sessionId) return
    try {
      const response = await fetch(`${apiBaseUrl}/sessions/${sessionId}/pause`, {
        method: 'POST'
      })
      if (!response.ok) throw new Error('Failed to pause session')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pause session')
    }
  }

  const handleResume = async () => {
    if (!sessionId) return
    try {
      const response = await fetch(`${apiBaseUrl}/sessions/${sessionId}/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          "broker_host": import.meta.env.VITE_MQTT_BROKER_HOST || '127.0.0.1',
          "broker_port": parseInt(import.meta.env.VITE_MQTT_BROKER_PORT || '1883'),
        }),
      })
      if (!response.ok) throw new Error('Failed to resume session')
      // Restart polling by bumping the key (in case it was stopped due to a failed state)
      setPollingKey(k => k + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resume session')
    }
  }

  const handleNodeDoubleClick = useCallback(async (_: any, node: any) => {
    const internalId = node.data?.internalBlueprintId;
    // Check if it's a composite task and has an ID
    if (!internalId && !node.data?.type?.toLowerCase().includes('composite')) return;

    // Use internalId if available, otherwise try to guess or use node ID if standard convention?
    // For now rely on internalId extracted from params
    if (!internalId) {
      console.warn("Composite node clicked but no blueprint ID found in params");
      return;
    }

    try {
      const fetchUrl = sessionId
        ? `${apiBaseUrl}/sessions/${sessionId}/blueprint/${internalId}`
        : `${apiBaseUrl}/blueprints/${internalId}`;

      const response = await fetch(fetchUrl);
      if (response.ok) {
        const newBlueprint = await response.json();

        // Push current blueprint to stack
        setBlueprintStack(prev => [...prev, localBlueprint]);

        // Set new blueprint
        setLocalBlueprint(newBlueprint);
        setGraphData(transformBlueprintToGraph(newBlueprint));
      }
    } catch (e) {
      console.error("Failed to fetch sub-blueprint", e);
    }
  }, [apiBaseUrl, localBlueprint, transformBlueprintToGraph, sessionId]);

  const handleNodeContextMenu = useCallback((event: React.MouseEvent, node: any) => {
    event.preventDefault();

    const taskId = node?.id || node?.data?.id;
    if (!taskId) return;

    const nodeStatus = node?.data?.status || 'PENDING';
    const nodeType = node?.data?.type || '';
    const scopeName = graphData?.scopes?.find(s => s.task_ids.includes(taskId))?.id ?? null;

    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      nodeId: taskId,
      nodeStatus,
      nodeType,
      scopeName,
    });
  }, [graphData]);

  const handleResetTask = useCallback(async (taskId: string, includeDownstream: boolean) => {
    setContextMenu(null);

    if (!sessionId) return;

    if (sessionState?.toLowerCase() === 'running') {
      setError('Pause the session before resetting tasks.');
      return;
    }

    const currentBlueprintId = localBlueprint?.data?.id || localBlueprint?.id || blueprintId || mainBlueprintId;
    if (!currentBlueprintId) return;

    try {
      const response = await fetch(`${apiBaseUrl}/sessions/${sessionId}/tasks/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blueprint_id: currentBlueprintId,
          task_id: taskId,
          include_downstream: includeDownstream,
          clear_outputs: false,
        }),
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || 'Failed to reset task');
      }

      // Immediately re-fetch the blueprint so the graph updates without
      // waiting for the next poll cycle.
      const currentId = localBlueprint?.data?.id || localBlueprint?.id;
      const refreshUrl = currentId
        ? `${apiBaseUrl}/sessions/${sessionId}/blueprint/${currentId}`
        : `${apiBaseUrl}/sessions/${sessionId}/blueprint`;
      const refreshResp = await fetch(refreshUrl);
      if (refreshResp.ok) {
        const updated = await refreshResp.json();
        setLocalBlueprint(updated);
        setGraphData(transformBlueprintToGraph(updated));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset task');
    }
  }, [apiBaseUrl, blueprintId, localBlueprint, mainBlueprintId, sessionId, sessionState, transformBlueprintToGraph]);

  const handleSkipTask = useCallback(async (taskId: string) => {
    setContextMenu(null);

    if (!sessionId) return;

    if (sessionState?.toLowerCase() === 'running') {
      setError('Pause the session before skipping tasks.');
      return;
    }

    const currentBlueprintId = localBlueprint?.data?.id || localBlueprint?.id || blueprintId || mainBlueprintId;
    if (!currentBlueprintId) return;

    try {
      const response = await fetch(`${apiBaseUrl}/sessions/${sessionId}/tasks/skip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blueprint_id: currentBlueprintId,
          task_id: taskId,
        }),
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || 'Failed to skip task');
      }

      // Immediately re-fetch the blueprint so the graph updates without
      // waiting for the next poll cycle.
      const currentId = localBlueprint?.data?.id || localBlueprint?.id;
      const refreshUrl = currentId
        ? `${apiBaseUrl}/sessions/${sessionId}/blueprint/${currentId}`
        : `${apiBaseUrl}/sessions/${sessionId}/blueprint`;
      const refreshResp = await fetch(refreshUrl);
      if (refreshResp.ok) {
        const updated = await refreshResp.json();
        setLocalBlueprint(updated);
        setGraphData(transformBlueprintToGraph(updated));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to skip task');
    }
  }, [apiBaseUrl, blueprintId, localBlueprint, mainBlueprintId, sessionId, sessionState, transformBlueprintToGraph]);

  const handleResetScope = useCallback(async (scopeName: string) => {
    setContextMenu(null);

    if (!sessionId) return;

    if (sessionState?.toLowerCase() === 'running') {
      setError('Pause the session before resetting a scope.');
      return;
    }

    try {
      const response = await fetch(`${apiBaseUrl}/sessions/${sessionId}/scopes/${encodeURIComponent(scopeName)}/reset`, {
        method: 'POST',
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || 'Failed to reset scope');
      }

      // Re-fetch the blueprint so the graph updates immediately.
      const currentId = localBlueprint?.data?.id || localBlueprint?.id;
      const refreshUrl = currentId
        ? `${apiBaseUrl}/sessions/${sessionId}/blueprint/${currentId}`
        : `${apiBaseUrl}/sessions/${sessionId}/blueprint`;
      const refreshResp = await fetch(refreshUrl);
      if (refreshResp.ok) {
        const updated = await refreshResp.json();
        setLocalBlueprint(updated);
        setGraphData(transformBlueprintToGraph(updated));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset scope');
    }
  }, [apiBaseUrl, localBlueprint, sessionId, sessionState, transformBlueprintToGraph]);

  const navigateToBlueprint = (index: number) => {
    // If clicking current blueprint (last item), do nothing
    if (index === blueprintStack.length) return;

    // We are going back to index. 
    // The blueprint at index becomes the new localBlueprint.
    // The stack becomes the elements before index.

    const targetBlueprint = blueprintStack[index];
    const newStack = blueprintStack.slice(0, index);

    setLocalBlueprint(targetBlueprint);
    setBlueprintStack(newStack);
    setGraphData(transformBlueprintToGraph(targetBlueprint));
  };

  const handleNavigateBack = () => {
    if (blueprintStack.length === 0) return;

    const previous = blueprintStack[blueprintStack.length - 1];
    setBlueprintStack(prev => prev.slice(0, -1));
    setLocalBlueprint(previous);
    setGraphData(transformBlueprintToGraph(previous));
  };

  const handleDownloadData = () => {
    if (!sessionData) return

    const recursivelyParseJson = (obj: any): any => {
      if (typeof obj === 'string') {
        try {
          const parsed = JSON.parse(obj)
          if (typeof parsed === 'object' && parsed !== null) {
            return recursivelyParseJson(parsed)
          }
        } catch (e) {
          // Not valid JSON or not an object/array, return original string
        }
        return obj
      } else if (Array.isArray(obj)) {
        return obj.map(recursivelyParseJson)
      } else if (typeof obj === 'object' && obj !== null) {
        const newObj: any = {}
        for (const key in obj) {
          newObj[key] = recursivelyParseJson(obj[key])
        }
        return newObj
      }
      return obj
    }

    const processedData = recursivelyParseJson(sessionData)
    const dataStr = JSON.stringify(processedData, null, 2)
    const blob = new Blob([dataStr], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `session-${sessionId || 'data'}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleStartSession = () => {
    if (!blueprintId) return;
    setShowStartDialog(true);
  };

  const onDialogSessionStarted = (newSessionId: string) => {
    setShowStartDialog(false);
    if (onSessionCreated) {
      onSessionCreated(newSessionId);
    } else {
      alert(`Session started: ${newSessionId}. Please open it from the Sessions list.`);
      onClose();
    }
  }

  const isRunning = sessionState?.toLowerCase() === 'running';
  const isFinished = ['completed', 'failed', 'cancelled'].includes(sessionState?.toLowerCase() || '');

  return (
    <div className="session-monitor">
      <div className="monitor-section-header main-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              BLUEPRINT: <span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{blueprintId || localBlueprint?.id || localBlueprint?.data?.id || mainBlueprintId}</span>
            </h3>
            <span className={`state-badge ${sessionState?.toLowerCase() || 'preview'}`}>
              {sessionState || 'PREVIEW'}
            </span>
          </div>

          <div className="session-controls" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {blueprintStack.length > 0 && (
              <button onClick={handleNavigateBack} className="control-button back-btn" style={{ marginRight: '0.5rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>← Back</span>
              </button>
            )}

            {sessionId ? (
              <>
                {isRunning ? (
                  <button onClick={handlePause} className="control-button start-preview-btn" title="Pause Session" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Pause size={16} /> <span>Pause</span>
                  </button>
                ) : isFinished ? (
                  <button onClick={handleResume} className="control-button start-preview-btn" title="Restart Session" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <RotateCcw size={16} /> <span>Restart Session</span>
                  </button>
                ) : (
                  <button onClick={handleResume} className="control-button start-preview-btn" title="Resume/Start Session" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Play size={16} /> <span>{['paused', 'stopped', 'failed'].includes(sessionState?.toLowerCase() || '') ? 'Resume session' : 'Start Session'}</span>
                  </button>
                )}
              </>
            ) : (
              <button onClick={handleStartSession} className="control-button start-preview-btn" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Plus size={16} /> <span>New Session</span>
              </button>
            )}
          </div>
        </div>

        {/* Session Info Row */}
        {(sessionId || localBlueprint?.name || localBlueprint?.description) && (
          <div style={{ fontSize: '0.85rem', color: '#777', marginTop: '0.25rem', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            {sessionId && (
              <span>
                Session: <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#444' }}>{sessionId}</span>
              </span>
            )}

            {(localBlueprint?.name || localBlueprint?.description) && (
              <>
                {sessionId && <span style={{ color: '#ddd' }}></span>}
              </>
            )}
          </div>
        )}

        {/* Breadcrumb Path Row */}
        {blueprintStack.length > 0 && (
          <div style={{ fontSize: '0.9rem', color: '#666', borderTop: '1px solid #eee', paddingTop: '0.5rem', width: '100%', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', overflowX: 'auto', whiteSpace: 'nowrap', gap: '0', scrollbarWidth: 'none' }}>
              {[...blueprintStack, localBlueprint].map((bp, index, arr) => {
                const isLast = index === arr.length - 1;
                const displayId = bp?.id || bp?.data?.id || (index === 0 ? (blueprintId || mainBlueprintId) : 'Unknown');

                return (
                  <div key={index} style={{ display: 'flex', alignItems: 'center' }}>
                    <span
                      onClick={() => !isLast && navigateToBlueprint(index)}
                      className={isLast ? 'breadcrumb-current' : 'breadcrumb-link'}
                    >
                      {displayId}
                    </span>
                    {!isLast && <ChevronRight size={14} style={{ margin: '0 2px', color: '#999', flexShrink: 0 }} />}
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>

      {error && <p className="error">{error}</p>}

      <div className="monitor-grid" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Diagram Section */}
        <div className="monitor-section" style={{ flex: 1, minHeight: 0, overflow: 'hidden', borderBottom: 'none' }}>

          <div className="diagram-container">
            {graphData ? (
              <SessionGraph
                data={graphData}
                onNodeSwap={localBlueprint ? handleNodeSwap : undefined}
                onNodeDoubleClick={handleNodeDoubleClick}
                onNodeContextMenu={handleNodeContextMenu}
                activeBlueprintId={localBlueprint?.id || localBlueprint?.data?.id || blueprintId || mainBlueprintId} />
            ) : (
              <div className="loading-container">
                <div className="loading-spinner"></div>
                <p>Loading graph...</p>
              </div>
            )}
          </div>
        </div>

        {/* Resize Handle */}
        {!isCollapsed && (
          <div
            onMouseDown={startResizing}
            style={{
              height: '4px',
              width: '100%',
              cursor: 'row-resize',
              background: 'var(--color-stone-soft)',
              zIndex: 10,
              flexShrink: 0,
              transition: 'background 0.2s',
            }}
            className="resize-handle"
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-terracotta-300)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'var(--color-stone-soft)'}
          />
        )}

        {/* Data Store Section */}
        <div className="monitor-section" style={{ height: isCollapsed ? 'auto' : datastoreHeight, flexShrink: 0, borderTop: isCollapsed ? '1px solid var(--color-stone-soft)' : 'none', width: '100%' }}>
          <div className="monitor-section-header">
            <h3>
              <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  color: 'inherit'
                }}
              >
                {isCollapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              Data Store
            </h3>
            <button className="download-data-btn" onClick={handleDownloadData} title="Download Data Store">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
            </button>
          </div>
          {!isCollapsed && (
            <div className="data-container">
              {sessionData ? (
                <div className="data-viewer-wrapper" style={{ height: '100%' }}>
                  <DataStoreExplorer data={parsedSessionData || {}} mainBlueprintId={mainBlueprintId} params={sessionParams} />
                </div>
              ) : (
                <div className="loading-container">
                  <div className="loading-spinner"></div>
                  <p>Loading data...</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showStartDialog && blueprintId && (
        <StartSessionDialog
          apiBaseUrl={apiBaseUrl}
          blueprintId={blueprintId}
          blueprintName={localBlueprint?.name || blueprintId}
          onSessionStarted={onDialogSessionStarted}
          onCancel={() => setShowStartDialog(false)}
        />
      )}

      {contextMenu && (
        <NodeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          nodeId={contextMenu.nodeId}
          nodeStatus={contextMenu.nodeStatus}
          nodeType={contextMenu.nodeType}
          scopeName={contextMenu.scopeName}
          hasSession={!!sessionId}
          onResetTask={handleResetTask}
          onSkipTask={handleSkipTask}
          onResetScope={handleResetScope}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}

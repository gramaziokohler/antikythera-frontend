import type { GraphData } from '../types'

export function transformBlueprintToGraph(blueprint: unknown): GraphData {
  const blueprintData = (blueprint as any).data || blueprint
  const tasks: any[] = blueprintData.tasks || []

  const nodes = tasks.map((taskWrapper: any) => {
    let details = ''
    const taskData = taskWrapper.data || taskWrapper
    const params = taskData.params

    const getParamValue = (paramObj: any) => {
      if (!paramObj) return undefined
      if (paramObj.data && (paramObj.data.value !== undefined || paramObj.data.default !== undefined)) {
        return paramObj.data.value !== undefined ? paramObj.data.value : paramObj.data.default
      }
      return paramObj.value !== undefined ? paramObj.value : paramObj.default
    }

    let blueprintParamVal = undefined
    if (Array.isArray(params)) {
      const p = params.find((x: any) => (x.name === 'blueprint' || x.data?.name === 'blueprint'))
      if (p) {
        blueprintParamVal = getParamValue(p)
      }
      if (!blueprintParamVal) {
        const candidate = params.find((x: any) => {
          const v = getParamValue(x)
          return v && (v.static || v.dynamic || v.blueprint_id)
        })
        if (candidate) {
          blueprintParamVal = getParamValue(candidate)
        }
      }
    } else if (params && typeof params === 'object') {
      blueprintParamVal = params.blueprint
    }

    let internalBlueprintId = null
    if (blueprintParamVal) {
      if (typeof blueprintParamVal === 'string') {
        internalBlueprintId = blueprintParamVal
        details = blueprintParamVal
      } else if (blueprintParamVal.dynamic) {
        if (blueprintParamVal.dynamic.blueprint_id) {
          internalBlueprintId = blueprintParamVal.dynamic.blueprint_id
        } else if (blueprintParamVal.dynamic.element?.element_id) {
          internalBlueprintId = blueprintParamVal.dynamic.element.element_id
        }
        details = internalBlueprintId || 'Dynamic'
      } else if (blueprintParamVal.static) {
        details = blueprintParamVal.static
        internalBlueprintId = details
      }
    }

    return {
      id: taskData.id,
      label: taskData.id,
      status: taskData.state || 'pending',
      details,
      type: taskData.type,
      description: taskData.description,
      condition: taskData.condition,
      inputs: taskData.inputs,
      outputs: taskData.outputs,
      internalBlueprintId,
    }
  })

  const validNodeIds = new Set(nodes.map((n: any) => n.id))

  const edges = tasks.flatMap((taskWrapper: any) => {
    const taskData = taskWrapper.data || taskWrapper
    const dependencies: any[] = taskData.depends_on || []
    return dependencies
      .map((depWrapper: any) => {
        const depData = depWrapper.data || depWrapper
        if (!validNodeIds.has(depData.id)) {
          console.warn(`Skipping edge: Source node '${depData.id}' not found in blueprint tasks.`)
          return null
        }
        if (!validNodeIds.has(taskData.id)) {
          console.warn(`Skipping edge: Target node '${taskData.id}' not found in blueprint tasks.`)
          return null
        }
        return { source: depData.id, target: taskData.id }
      })
      .filter((e): e is { source: string; target: string } => e !== null)
  })

  const scopes = (blueprintData.scopes || []).map((s: any) => {
    const scopeData = s.data || s
    return {
      id: scopeData.id,
      label: scopeData.label || scopeData.id,
      task_ids: scopeData.task_ids || [],
      policy_type: scopeData.policy_type || 'skip',
      policy: scopeData.policy || {},
    }
  })

  return { nodes, edges, scopes }
}

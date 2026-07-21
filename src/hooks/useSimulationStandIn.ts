import { useEffect } from 'react';
import { MqttService } from '../services/MqttService';
import { AgentLauncher } from '../agents/AgentLauncher';
import { SimulationAgent } from '../agents/SimulationAgent';
import { isDrivingSimulationSession } from '../utils/simulation-session';

/**
 * Registers the ADR-0003 stand-in agent for `sessionId`, but only in the tab that pressed
 * Simulate for it (per the sessionStorage marker written by blueprint-simulate's caller). A
 * second tab viewing the same session registers nothing and only renders the graph.
 */
export function useSimulationStandIn(sessionId: string | null | undefined): void {
  useEffect(() => {
    if (!sessionId || !isDrivingSimulationSession(sessionId)) return;

    const mqttService = MqttService.getInstance();
    const agentLauncher = AgentLauncher.getInstance(mqttService);
    const agent = new SimulationAgent();
    agentLauncher.registerAgent(agent);

    return () => {
      agentLauncher.unregisterAgent(agent.type);
    };
  }, [sessionId]);
}

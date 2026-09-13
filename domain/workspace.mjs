import { configuredRoutes } from './routing.mjs';

export function capabilitySummary(workspace) {
  const capabilities = workspace?.capabilities ?? {};
  return Object.values(capabilities).filter((capability) => capability?.enabled).map((capability) => capability.label).join(', ') || 'No capabilities are enabled.';
}

export function publicWorkspace(workspace) {
  return {
    id: workspace.id,
    name: workspace.name,
    description: workspace.description,
    voice: workspace.voice,
    capabilities: workspace.capabilities,
    routing: { default_route: workspace.routing?.default_route, routes: configuredRoutes(workspace).map(({ id, label, description }) => ({ id, label, description })) },
    capability_summary: capabilitySummary(workspace)
  };
}

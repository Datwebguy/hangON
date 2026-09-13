function cleanText(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(cleanText).join(' ');
  if (value && typeof value === 'object') return Object.values(value).map(cleanText).join(' ');
  return '';
}

export function configuredRoutes(workspace) {
  const routing = workspace?.routing || {};
  const routes = Array.isArray(routing.routes) ? routing.routes : [];
  const normalized = routes.filter((route) => route?.id && route?.label).map((route) => ({
    id: String(route.id),
    label: String(route.label),
    description: String(route.description || ''),
    keywords: Array.isArray(route.keywords) ? route.keywords.map((keyword) => String(keyword).toLowerCase()).filter(Boolean) : []
  }));
  if (normalized.length) return normalized;
  return [{ id: 'general', label: 'General requests', description: 'Requests waiting for team review.', keywords: [] }];
}

export function routeRequest(request, workspace) {
  const routes = configuredRoutes(workspace);
  const fallbackId = workspace?.routing?.default_route || routes[0].id;
  const text = `${request.request_summary} ${cleanText(request.details)}`.toLowerCase();
  const match = routes.find((route) => route.keywords.length && route.keywords.some((keyword) => text.includes(keyword)));
  const route = match || routes.find((candidate) => candidate.id === fallbackId) || routes[0];
  return { id: route.id, label: route.label, matched_by: match ? 'configured_keyword' : 'workspace_default' };
}

export function routingSummary(workspace) {
  return configuredRoutes(workspace).map((route) => route.label).join(', ');
}

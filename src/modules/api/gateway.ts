import {requestApi} from './http';
import type {
  ModuleCapabilityItem,
  ModuleGatewayCapabilitiesResponse,
  ModuleGatewayHealthResponse,
  ModuleHealthItem,
} from './types';

const asHealthStatus = (ok: boolean): 'healthy' | 'down' => (ok ? 'healthy' : 'down');

export const fetchModulesHealth = async (): Promise<{
  ok: boolean;
  items: ModuleHealthItem[];
  missingModules: string[];
}> => {
  const response = await requestApi<ModuleGatewayHealthResponse>('/v1/modules/health');
  const modules = response.modules || {};
  const items = Object.entries(modules).map(([moduleName, details]) => {
    const ok = Boolean((details as {ok?: boolean})?.ok);
    return {
      module: moduleName,
      status: asHealthStatus(ok),
      ok,
      provider: typeof (details as {provider?: unknown})?.provider === 'string'
        ? String((details as {provider?: string}).provider)
        : undefined,
      strictMode: Boolean((details as {strictMode?: boolean})?.strictMode),
      details,
    } as ModuleHealthItem;
  });
  return {
    ok: Boolean(response.ok),
    items,
    missingModules: Array.isArray(response.missingModules) ? response.missingModules : [],
  };
};

export const fetchModulesCapabilities = async (): Promise<ModuleCapabilityItem[]> => {
  const response = await requestApi<ModuleGatewayCapabilitiesResponse>('/v1/modules/capabilities');
  return Array.isArray(response.modules) ? response.modules : [];
};


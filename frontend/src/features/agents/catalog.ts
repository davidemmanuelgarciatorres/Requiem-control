import type { Dictionary } from '../../i18n/es';

type CatalogKey = keyof Dictionary['agents']['catalog'];
type PermKey = keyof Dictionary['agents']['perms'];

/**
 * Especificación previa del catálogo de agentes (solo metadatos de interfaz).
 * La definición autoritativa —esquemas de entrada/salida, herramientas,
 * límites, timeouts, reintentos— vivirá en el servicio de IA (Fase 4) y en la
 * tabla `agent_definitions`. Nada aquí ejecuta un agente.
 */
export type AgentSpecPreview = {
  id: string;
  key: CatalogKey;
  version: string;
  phase: number;
  mvp: boolean;
  readOnly: boolean;
  requiresApproval: boolean;
  permissions: PermKey[];
};

export const AGENT_CATALOG: AgentSpecPreview[] = [
  { id: 'data-analyst', key: 'dataAnalyst', version: '0.0.0', phase: 4, mvp: true, readOnly: true, requiresApproval: false, permissions: ['readDataset', 'analyze', 'report'] },
  { id: 'financial-analyst', key: 'financialAnalyst', version: '0.0.0', phase: 4, mvp: true, readOnly: true, requiresApproval: false, permissions: ['readDataset', 'analyze', 'report'] },
  { id: 'inventory-analyst', key: 'inventoryAnalyst', version: '0.0.0', phase: 7, mvp: false, readOnly: false, requiresApproval: true, permissions: ['readDataset', 'analyze', 'requestUpdate'] },
  { id: 'customer-ops', key: 'customerOps', version: '0.0.0', phase: 7, mvp: false, readOnly: false, requiresApproval: true, permissions: ['readDataset', 'analyze', 'draftEmail'] },
  { id: 'email-ops', key: 'emailOps', version: '0.0.0', phase: 7, mvp: false, readOnly: false, requiresApproval: true, permissions: ['draftEmail', 'requestSend'] },
  { id: 'automation', key: 'automation', version: '0.0.0', phase: 7, mvp: false, readOnly: false, requiresApproval: true, permissions: ['runWorkflow', 'requestUpdate', 'requestSend'] },
];

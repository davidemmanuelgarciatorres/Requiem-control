import type { LucideIcon } from 'lucide-react';
import {
  Bot, Boxes, FileText, LayoutDashboard, Mail, Palette, Plug, Settings, Sparkles, Table2, Users, Wallet, Workflow,
} from 'lucide-react';
import type { Dictionary } from '../i18n/es';

export type NavId = Exclude<keyof Dictionary['nav'], 'label' | 'sectionOperate' | 'sectionIntelligence' | 'sectionPlatform' | 'openMenu' | 'closeMenu' | 'phaseProgress' | 'phaseNote'>;
export type ModuleId = keyof Omit<Dictionary['modules'], 'statusTitle' | 'plannedPhase' | 'capabilitiesTitle' | 'notOperational'>;

/**
 * Estado honesto de cada sección:
 * - `live`: funciona hoy (aunque pueda mostrar datos de demostración etiquetados).
 * - `planned`: pantalla informativa; la funcionalidad llega en `phase`.
 */
export type NavStatus = 'live' | 'planned';

export type NavItem = {
  id: NavId;
  path: string;
  icon: LucideIcon;
  status: NavStatus;
  phase?: number;
  /** Si existe, la ruta usa la plantilla genérica de módulo planificado. */
  module?: ModuleId;
};

export type NavSection = { id: 'sectionOperate' | 'sectionIntelligence' | 'sectionPlatform'; items: NavItem[] };

export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'sectionOperate',
    items: [
      { id: 'overview', path: '/', icon: LayoutDashboard, status: 'live' },
      { id: 'assistant', path: '/assistant', icon: Sparkles, status: 'live', phase: 4 },
      { id: 'agents', path: '/agents', icon: Bot, status: 'live', phase: 4 },
      { id: 'automations', path: '/automations', icon: Workflow, status: 'planned', phase: 7, module: 'automations' },
    ],
  },
  {
    id: 'sectionIntelligence',
    items: [
      { id: 'finance', path: '/finance', icon: Wallet, status: 'live', phase: 4 },
      { id: 'data', path: '/data', icon: Table2, status: 'live', phase: 3 },
      { id: 'inventory', path: '/inventory', icon: Boxes, status: 'planned', phase: 7, module: 'inventory' },
      { id: 'customers', path: '/customers', icon: Users, status: 'planned', phase: 7, module: 'customers' },
      { id: 'email', path: '/email', icon: Mail, status: 'planned', phase: 7, module: 'email' },
      { id: 'reports', path: '/reports', icon: FileText, status: 'live', phase: 5 },
    ],
  },
  {
    id: 'sectionPlatform',
    items: [
      { id: 'integrations', path: '/integrations', icon: Plug, status: 'live', phase: 6 },
      { id: 'settings', path: '/settings', icon: Settings, status: 'live' },
      { id: 'designSystem', path: '/design-system', icon: Palette, status: 'live' },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

export function findNavItem(id: NavId): NavItem {
  const item = NAV_ITEMS.find((i) => i.id === id);
  if (!item) throw new Error(`Unknown nav item ${id}`);
  return item;
}

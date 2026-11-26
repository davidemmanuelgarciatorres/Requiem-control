import type { Language } from '../../app/preferences';

/**
 * ⚠️ DATOS DE DEMOSTRACIÓN — FICTICIOS.
 * Ninguna cifra proviene de un sistema real ni de procesamiento con IA.
 * Existen solo para mostrar el diseño del panel en la Fase 1. Toda vista que
 * los use debe mostrar <DemoBadge/> y el aviso de demostración.
 */
export const DEMO_FLAG = true as const;

export type AgentRunState = 'running' | 'idle' | 'awaiting' | 'failed';

export type DemoDashboard = {
  isDemo: typeof DEMO_FLAG;
  currency: 'MXN';
  weeklyRevenue: { label: string; value: number }[];
  monthlyRevenueGoal: number;
  expenses: number[];
  grossMargin: number[];
  records: { total: number; valid: number };
  activity: number[][];
  agents: { key: 'dataAnalyst' | 'financialAnalyst' | 'inventoryAnalyst' | 'emailOps'; state: AgentRunState; tasks: number; trend: number[] }[];
  recommendations: { id: string; severity: 'warning' | 'info'; detected: string; evidence: string; period: string; why: string; action: string; limitations: string }[];
  approvals: { id: string; title: string; agent: string; prepared: string }[];
  events: { id: string; text: string; time: string; tone: 'success' | 'warning' | 'danger' | 'info' }[];
};

const WEEKLY = [182_400, 176_900, 191_200, 205_800, 198_300, 214_600, 221_900, 209_400, 232_100, 241_700, 236_500, 254_300];

/** Generador determinista para que la demo sea estable entre renders y pruebas. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function activityMatrix(): number[][] {
  const rand = seeded(42);
  return Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => (d >= 5 ? Math.round(rand() * 2) : Math.round(rand() * 6 + w * 0.8))),
  );
}

const TEXT: Record<Language, Pick<DemoDashboard, 'recommendations' | 'approvals' | 'events'>> = {
  es: {
    recommendations: [
      {
        id: 'rec-logistics',
        severity: 'warning',
        detected: 'Los gastos de logística subieron 18 % frente a las 4 semanas anteriores.',
        evidence: '1,204 registros con categoría “Logística” en gastos_demo.xlsx (ficticio).',
        period: 'Últimas 4 semanas vs. 4 semanas previas',
        why: 'Reduce el margen bruto en aproximadamente 1.2 puntos porcentuales.',
        action: 'Revisar tarifas con los dos proveedores de mayor volumen.',
        limitations: 'No incluye facturas pendientes de captura ni costos de devoluciones.',
      },
      {
        id: 'rec-duplicates',
        severity: 'info',
        detected: '312 posibles clientes duplicados (mismo RFC con distinto nombre).',
        evidence: 'Columnas “rfc” y “razon_social” de clientes_demo.csv (ficticio).',
        period: 'Importación más reciente',
        why: 'Los duplicados distorsionan la segmentación y los saldos por cliente.',
        action: 'Revisar y fusionar los registros marcados antes del próximo reporte.',
        limitations: 'La coincidencia por RFC no detecta clientes sin RFC registrado.',
      },
    ],
    approvals: [
      { id: 'ap-1', title: 'Enviar recordatorio de pago a 14 clientes', agent: 'Operaciones de correo', prepared: 'Preparado hace 12 min' },
      { id: 'ap-2', title: 'Marcar 37 SKU con stock negativo para revisión', agent: 'Analista de inventario', prepared: 'Preparado hace 1 h' },
    ],
    events: [
      { id: 'ev-1', text: 'Analista de datos completó el análisis de ventas_demo.csv', time: 'Hace 4 min', tone: 'success' },
      { id: 'ev-2', text: 'Analista financiero detectó 6 transacciones inusuales', time: 'Hace 18 min', tone: 'warning' },
      { id: 'ev-3', text: 'Importación de clientes_demo.csv validada (98.7 % filas válidas)', time: 'Hace 1 h', tone: 'info' },
      { id: 'ev-4', text: 'Operaciones de correo alcanzó su límite de uso', time: 'Hace 3 h', tone: 'danger' },
    ],
  },
  en: {
    recommendations: [
      {
        id: 'rec-logistics',
        severity: 'warning',
        detected: 'Logistics expenses rose 18% versus the previous 4 weeks.',
        evidence: '1,204 records with category “Logistics” in expenses_demo.xlsx (fictitious).',
        period: 'Last 4 weeks vs. previous 4 weeks',
        why: 'It lowers gross margin by roughly 1.2 percentage points.',
        action: 'Review rates with the two highest-volume carriers.',
        limitations: 'Excludes invoices not yet captured and return costs.',
      },
      {
        id: 'rec-duplicates',
        severity: 'info',
        detected: '312 possible duplicate customers (same tax ID, different name).',
        evidence: 'Columns “tax_id” and “company_name” in customers_demo.csv (fictitious).',
        period: 'Latest import',
        why: 'Duplicates distort segmentation and per-customer balances.',
        action: 'Review and merge the flagged records before the next report.',
        limitations: 'Tax-ID matching cannot detect customers without a tax ID.',
      },
    ],
    approvals: [
      { id: 'ap-1', title: 'Send a payment reminder to 14 customers', agent: 'Email Operations', prepared: 'Prepared 12 min ago' },
      { id: 'ap-2', title: 'Flag 37 SKUs with negative stock for review', agent: 'Inventory Analyst', prepared: 'Prepared 1 h ago' },
    ],
    events: [
      { id: 'ev-1', text: 'Data Analyst finished analyzing sales_demo.csv', time: '4 min ago', tone: 'success' },
      { id: 'ev-2', text: 'Financial Analyst flagged 6 unusual transactions', time: '18 min ago', tone: 'warning' },
      { id: 'ev-3', text: 'customers_demo.csv import validated (98.7% valid rows)', time: '1 h ago', tone: 'info' },
      { id: 'ev-4', text: 'Email Operations reached its usage limit', time: '3 h ago', tone: 'danger' },
    ],
  },
};

export function buildDemoDashboard(lang: Language): DemoDashboard {
  const weekPrefix = lang === 'es' ? 'S' : 'W';
  return {
    isDemo: DEMO_FLAG,
    currency: 'MXN',
    weeklyRevenue: WEEKLY.map((value, i) => ({ label: `${weekPrefix}${i + 1}`, value })),
    monthlyRevenueGoal: 1_200_000,
    expenses: [598_000, 604_500, 611_200, 607_900, 622_300, 631_800, 640_500, 655_200],
    grossMargin: [0.351, 0.356, 0.349, 0.362, 0.358, 0.364, 0.371, 0.382],
    records: { total: 48_213, valid: 45_368 },
    activity: activityMatrix(),
    agents: [
      { key: 'dataAnalyst', state: 'running', tasks: 312, trend: [4, 6, 5, 8, 7, 10, 12] },
      { key: 'financialAnalyst', state: 'awaiting', tasks: 41, trend: [3, 3, 5, 4, 6, 5, 7] },
      { key: 'inventoryAnalyst', state: 'idle', tasks: 18, trend: [2, 3, 2, 2, 3, 2, 2] },
      { key: 'emailOps', state: 'failed', tasks: 6, trend: [5, 4, 6, 3, 2, 1, 0] },
    ],
    ...TEXT[lang],
  };
}

/** Indicadores derivados (se calculan, no se escriben a mano). */
export function deriveKpis(d: DemoDashboard) {
  const w = d.weeklyRevenue.map((p) => p.value);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const current = sum(w.slice(-4));
  const previous = sum(w.slice(-8, -4));
  const last = <T,>(xs: T[], back = 1): T => xs[xs.length - back]!;
  return {
    revenue: current,
    revenueChange: current / previous - 1,
    revenueGoalProgress: current / d.monthlyRevenueGoal,
    expenses: last(d.expenses),
    expensesChange: last(d.expenses) / last(d.expenses, 2) - 1,
    margin: last(d.grossMargin),
    marginChange: last(d.grossMargin) - last(d.grossMargin, 2),
    quality: d.records.valid / d.records.total,
  };
}

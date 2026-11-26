/**
 * Almacenamiento de las imágenes flotantes.
 * - App real: API (`/api/me/floaters`), ligadas a la cuenta del usuario.
 * - Demostración sin servidor: este dispositivo (localStorage como data URLs).
 */
import { api, uploadFile } from '../../lib/api';
import { IS_DEMO } from '../../lib/env';

export type FloaterShape = 'splash' | 'stars' | 'hearts' | 'ring' | 'sparks';
export type FloaterPrefs = {
  enabled: boolean;
  size: number;
  speed: 'slow' | 'normal' | 'fast';
  effect_shape: FloaterShape;
  effect_color: string;
  layer: 'front' | 'back';
};
export type FloaterImage = { id: string; url: string };
export type FloaterState = { preferences: FloaterPrefs; images: FloaterImage[]; max: number };

export const DEFAULT_PREFS: FloaterPrefs = { enabled: true, size: 64, speed: 'normal', effect_shape: 'splash', effect_color: '#ff6a1a', layer: 'front' };
export const SIZE_MIN = 32;
export const SIZE_MAX = 120;
export const MAX_IMAGES = 3;

type ApiFloaters = { preferences: FloaterPrefs; images: { id: string; position: number }[]; max_images: number };
type LocalData = { preferences: FloaterPrefs; images: FloaterImage[] };
const LOCAL_KEY = 'rc.demo.floaters.v1';
let memory: LocalData | null = null;

function readLocal(): LocalData {
  if (memory) return memory;
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (raw) return (memory = JSON.parse(raw) as LocalData);
  } catch {
    /* sin almacenamiento */
  }
  return (memory = { preferences: DEFAULT_PREFS, images: [] });
}
function writeLocal(d: LocalData) {
  memory = d;
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(d));
  } catch {
    /* sin almacenamiento: vive en memoria */
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function loadFloaters(): Promise<FloaterState> {
  if (IS_DEMO) {
    const d = readLocal();
    return { preferences: { ...DEFAULT_PREFS, ...d.preferences }, images: d.images, max: MAX_IMAGES };
  }
  const d = await api<ApiFloaters>('/me/floaters');
  return {
    preferences: { ...DEFAULT_PREFS, ...d.preferences },
    images: d.images.map((i) => ({ id: i.id, url: `/api/me/floaters/${i.id}/image` })),
    max: d.max_images,
  };
}

export async function addFloater(blob: Blob): Promise<void> {
  if (IS_DEMO) {
    const d = readLocal();
    if (d.images.length >= MAX_IMAGES) throw new Error('floaters.limit');
    writeLocal({ ...d, images: [...d.images, { id: `local-${Date.now()}`, url: await blobToDataUrl(blob) }] });
    return;
  }
  await uploadFile('/me/floaters', new File([blob], 'floater.webp', { type: blob.type || 'image/webp' }));
}

export async function removeFloater(id: string): Promise<void> {
  if (IS_DEMO) {
    const d = readLocal();
    writeLocal({ ...d, images: d.images.filter((i) => i.id !== id) });
    return;
  }
  await api(`/me/floaters/${id}`, { method: 'DELETE' });
}

export async function saveFloaterPrefs(p: FloaterPrefs): Promise<void> {
  if (IS_DEMO) {
    writeLocal({ ...readLocal(), preferences: p });
    return;
  }
  await api('/me/preferences/floaters', { method: 'PUT', body: p });
}

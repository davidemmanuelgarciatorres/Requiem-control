import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../../app/auth';
import { addFloater, DEFAULT_PREFS, loadFloaters, MAX_IMAGES, removeFloater, saveFloaterPrefs, type FloaterPrefs, type FloaterState } from './floaterStore';

type Value = FloaterState & {
  ready: boolean;
  add: (blob: Blob) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setPrefs: (patch: Partial<FloaterPrefs>) => void;
};

const Ctx = createContext<Value | null>(null);
const EMPTY: FloaterState = { preferences: DEFAULT_PREFS, images: [], max: MAX_IMAGES };

/** Estado compartido entre la capa animada y la configuración. */
export function FloatersProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [state, setState] = useState<FloaterState>(EMPTY);
  const [ready, setReady] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      setState(await loadFloaters());
    } catch {
      setState(EMPTY);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    loadFloaters()
      .then((next) => !cancelled && setState(next))
      .catch(() => !cancelled && setState(EMPTY))
      .finally(() => !cancelled && setReady(true));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const value = useMemo<Value>(() => ({
    ...state,
    ready,
    add: async (blob) => {
      await addFloater(blob);
      await refresh();
    },
    remove: async (id) => {
      await removeFloater(id);
      await refresh();
    },
    setPrefs: (patch) => {
      setState((s) => {
        const preferences = { ...s.preferences, ...patch };
        // Guardado diferido: los deslizadores no envían una petición por cada paso.
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => void saveFloaterPrefs(preferences).catch(() => undefined), 400);
        return { ...s, preferences };
      });
    },
  }), [state, ready, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFloaters(): Value {
  const v = useContext(Ctx);
  if (!v) throw new Error('useFloaters must be used within FloatersProvider');
  return v;
}

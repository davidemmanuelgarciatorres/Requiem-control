import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { es, type Dictionary } from '../i18n/es';
import { en } from '../i18n/en';
import { readPreference, writePreference } from '../lib/storage';

export type Language = 'es' | 'en';
export type MotionPreference = 'system' | 'reduced';

export const DICTIONARIES: Record<Language, Dictionary> = { es, en };
export const LANGUAGES: readonly Language[] = ['es', 'en'];

const LANG_KEY = 'rc.lang';
const MOTION_KEY = 'rc.motion';

type PreferencesValue = {
  lang: Language;
  setLang: (lang: Language) => void;
  t: Dictionary;
  motion: MotionPreference;
  setMotion: (motion: MotionPreference) => void;
};

const PreferencesContext = createContext<PreferencesValue | null>(null);

function initialLanguage(): Language {
  const stored = readPreference(LANG_KEY);
  if (stored === 'es' || stored === 'en') return stored;
  const nav = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : 'es';
  return nav.startsWith('en') ? 'en' : 'es';
}

function initialMotion(): MotionPreference {
  return readPreference(MOTION_KEY) === 'reduced' ? 'reduced' : 'system';
}

export function PreferencesProvider({ children, initialLang }: { children: ReactNode; initialLang?: Language }) {
  const [lang, setLangState] = useState<Language>(() => initialLang ?? initialLanguage());
  const [motion, setMotionState] = useState<MotionPreference>(initialMotion);

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    writePreference(LANG_KEY, next);
  }, []);

  const setMotion = useCallback((next: MotionPreference) => {
    setMotionState(next);
    writePreference(MOTION_KEY, next);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    const root = document.documentElement;
    if (motion === 'reduced') root.dataset.motion = 'reduced';
    else delete root.dataset.motion;
  }, [motion]);

  const value = useMemo(() => ({ lang, setLang, t: DICTIONARIES[lang], motion, setMotion }), [lang, setLang, motion, setMotion]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider');
  return ctx;
}

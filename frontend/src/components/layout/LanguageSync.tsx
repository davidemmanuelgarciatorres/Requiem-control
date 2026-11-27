import { useEffect } from 'react';
import { useAuth } from '../../app/auth';
import { usePreferences } from '../../app/preferences';
import { api, type SessionInfo } from '../../lib/api';

/** Guarda en el perfil el idioma elegido en pantalla: así agentes, reportes y correos usan el mismo. */
export function LanguageSync() {
  const { lang } = usePreferences();
  const { session, applySession } = useAuth();
  const saved = session?.user.preferred_language;
  useEffect(() => {
    if (!saved || saved === lang) return;
    api<SessionInfo>('/auth/me', { method: 'PATCH', body: { preferred_language: lang } })
      .then(applySession)
      .catch(() => undefined); // no es crítico: se reintenta al siguiente cambio
  }, [lang, saved, applySession]);
  return null;
}

import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { IS_DEMO } from './lib/env';
import { AuthProvider } from './app/auth';
import { PreferencesProvider } from './app/preferences';
import { AppRoutes } from './AppRoutes';

export function App() {
  return (
    <PreferencesProvider>
      <AuthProvider>
        {IS_DEMO ? (
          // La demo se publica en un marco que no admite rutas en la URL.
          <MemoryRouter>
            <AppRoutes />
          </MemoryRouter>
        ) : (
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        )}
      </AuthProvider>
    </PreferencesProvider>
  );
}

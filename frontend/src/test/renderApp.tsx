import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../app/auth';
import { PreferencesProvider, type Language } from '../app/preferences';
import { AppRoutes } from '../AppRoutes';

export function renderApp(path = '/', lang: Language = 'es') {
  return render(
    <PreferencesProvider initialLang={lang}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </PreferencesProvider>,
  );
}

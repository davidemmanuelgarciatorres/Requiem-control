import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PreferencesProvider, type Language } from '../app/preferences';
import { AppRoutes } from '../AppRoutes';

export function renderApp(path = '/', lang: Language = 'es') {
  return render(
    <PreferencesProvider initialLang={lang}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </PreferencesProvider>,
  );
}

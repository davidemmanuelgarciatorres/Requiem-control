import { BrowserRouter } from 'react-router-dom';
import { PreferencesProvider } from './app/preferences';
import { AppRoutes } from './AppRoutes';

export function App() {
  return (
    <PreferencesProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </PreferencesProvider>
  );
}

import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './app/auth';
import { PreferencesProvider } from './app/preferences';
import { AppRoutes } from './AppRoutes';

export function App() {
  return (
    <PreferencesProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </PreferencesProvider>
  );
}

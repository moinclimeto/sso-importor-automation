import { AuthProvider } from './context/AuthContext.jsx';
import AppRoutes from './routes/AppRoutes.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import UpdateBanner from './components/UpdateBanner.jsx';

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppRoutes />
        <UpdateBanner />
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;

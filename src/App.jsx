import { AuthProvider } from './context/AuthContext.jsx';
import AppRoutes from './routes/AppRoutes.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;

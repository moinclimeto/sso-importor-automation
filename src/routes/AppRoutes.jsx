import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import LoginPage from '../pages/Login.jsx';
import MainLayout from '../components/MainLayout.jsx';
import Dashboard from '../pages/Dashboard.jsx';
import Companies from '../pages/Companies.jsx';
import Purchases from '../pages/Purchases.jsx';
import Sales from '../pages/Sales.jsx';
import Summary from '../pages/Summary.jsx';
import DocProcessor from '../pages/DocProcessor.jsx';
import DocUpload from '../pages/DocUpload.jsx';
import DocTable from '../pages/DocTable.jsx';

function ProtectedRoute({ children }) {
  const { isLoggedIn } = useAuth();
  return isLoggedIn ? children : <Navigate to="/login" replace />;
}

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="companies" element={<Companies />} />
          <Route path="purchases" element={<Purchases />} />
          <Route path="sales" element={<Sales />} />
          <Route path="summary" element={<Summary />} />
          <Route path="doc-processor" element={<DocProcessor />} />
          <Route path="doc-upload" element={<DocUpload />} />
          <Route path="doc-table" element={<DocTable />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

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
import EprData from '../pages/EprData.jsx';
import EprSalesData from '../pages/EprSalesData.jsx';
import EprProcurementData from '../pages/EprProcurementData.jsx';
import EprProductionData from '../pages/EprProductionData.jsx';
import CpcbDashboard from '../pages/CpcbDashboard.jsx';

function ProtectedRoute({ children }) {
  const { isLoggedIn } = useAuth();
  return isLoggedIn ? children : <Navigate to="/login" replace />;
}

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Navigate to="/doc-processor" replace />} />
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
          <Route path="epr-data" element={<EprData />} />
          <Route path="epr-sales" element={<EprSalesData />} />
          <Route path="epr-procurement" element={<EprProcurementData />} />
          <Route path="epr-production" element={<EprProductionData />} />
          <Route path="cpcb-dashboard" element={<CpcbDashboard />} />
          <Route path="doc-processor" element={<DocProcessor />} />
          <Route path="doc-upload" element={<DocUpload />} />
          <Route path="doc-table" element={<DocTable />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

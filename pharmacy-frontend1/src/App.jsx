import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import MedicinesPage from './pages/MedicinesPage';
import PurchasesPage from './pages/PurchasesPage';
import SalesPage from './pages/SalesPage';
import BillingPage from './pages/BillingPage';
import SalesDashboard from './pages/SalesDashboard';


function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/medicines" element={<MedicinesPage />} />
        <Route path="/purchases" element={<PurchasesPage />} />
        {/* <Route path="/sales" element={<SalesPage />} /> */}
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/sales" element={<SalesDashboard />} />

      </Routes>
    </BrowserRouter>
  );
}

export default App;

import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AppLayout, RequireAuth } from './components/layout/AppLayout';
import { LoadingState } from './components/ui/States';
import LoginPage from './pages/auth/LoginPage';

const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'));
const PropertiesPage = lazy(() => import('./pages/properties/PropertiesPage'));
const PropertyDetailPage = lazy(() => import('./pages/properties/PropertyDetailPage'));
const RoomsPage = lazy(() => import('./pages/rooms/RoomsPage'));
const RoomDetailPage = lazy(() => import('./pages/rooms/RoomDetailPage'));
const TenantsPage = lazy(() => import('./pages/tenants/TenantsPage'));
const TenantDetailPage = lazy(() => import('./pages/tenants/TenantDetailPage'));
const ContractsPage = lazy(() => import('./pages/contracts/ContractsPage'));
const ContractDetailPage = lazy(() => import('./pages/contracts/ContractDetailPage'));
const InvoicesPage = lazy(() => import('./pages/invoices/InvoicesPage'));
const InvoiceDetailPage = lazy(() => import('./pages/invoices/InvoiceDetailPage'));
const PaymentsPage = lazy(() => import('./pages/payments/PaymentsPage'));
const MetersPage = lazy(() => import('./pages/meters/MetersPage'));
const FinancePage = lazy(() => import('./pages/finance/FinancePage'));
const MaintenancePage = lazy(() => import('./pages/maintenance/MaintenancePage'));
const ReportsPage = lazy(() => import('./pages/reports/ReportsPage'));
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage'));
const InvoicePrintPage = lazy(() => import('./pages/print/InvoicePrintPage'));
const ContractPrintPage = lazy(() => import('./pages/print/ContractPrintPage'));
const ReceiptPrintPage = lazy(() => import('./pages/print/ReceiptPrintPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const NotificationsPage = lazy(() => import('./pages/notifications/NotificationsPage'));
const ZaloSendPage = lazy(() => import('./pages/zalo/ZaloSendPage'));

export default function App() {
  return (
    <Suspense fallback={<LoadingState className="min-h-[60vh]" />}>
      <Routes>
        <Route path="/dang-nhap" element={<LoginPage />} />
        <Route path="/in/hoa-don/:id" element={<RequireAuth><InvoicePrintPage /></RequireAuth>} />
        <Route path="/in/hop-dong/:id" element={<RequireAuth><ContractPrintPage /></RequireAuth>} />
        <Route path="/in/phieu-thu/:id" element={<RequireAuth><ReceiptPrintPage /></RequireAuth>} />
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="khu-tro" element={<PropertiesPage />} />
          <Route path="khu-tro/:id" element={<PropertyDetailPage />} />
          <Route path="phong" element={<RoomsPage />} />
          <Route path="phong/:id" element={<RoomDetailPage />} />
          <Route path="nguoi-thue" element={<TenantsPage />} />
          <Route path="nguoi-thue/:id" element={<TenantDetailPage />} />
          <Route path="hop-dong" element={<ContractsPage />} />
          <Route path="hop-dong/:id" element={<ContractDetailPage />} />
          <Route path="hoa-don" element={<InvoicesPage />} />
          <Route path="hoa-don/:id" element={<InvoiceDetailPage />} />
          <Route path="thanh-toan" element={<PaymentsPage />} />
          <Route path="dien-nuoc" element={<MetersPage />} />
          <Route path="thu-chi" element={<FinancePage />} />
          <Route path="sua-chua" element={<MaintenancePage />} />
          <Route path="bao-cao" element={<ReportsPage />} />
          <Route path="cai-dat" element={<SettingsPage />} />
          <Route path="thong-bao" element={<NotificationsPage />} />
          <Route path="gui-zalo" element={<ZaloSendPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

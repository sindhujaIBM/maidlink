import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { RequireRole } from './components/auth/RequireRole';

// Pages
import { HomePage }          from './pages/HomePage';
import { AuthCallback }      from './pages/AuthCallback';
import { DashboardPage }     from './pages/DashboardPage';
import { MaidListPage }      from './pages/MaidListPage';
import { MaidDetailPage }    from './pages/MaidDetailPage';
import { BookingsPage }      from './pages/BookingsPage';
import { ProfilePage }       from './pages/ProfilePage';
import { MaidSetupPage }     from './pages/maid/MaidSetupPage';
import { AvailabilityPage }  from './pages/maid/AvailabilityPage';
import { MaidBookingsPage }  from './pages/maid/MaidBookingsPage';
import { EarningsPage }      from './pages/maid/EarningsPage';
import { AdminDashboard }      from './pages/admin/AdminDashboard';
import { AdminMaidsPage }      from './pages/admin/AdminMaidsPage';
import { AdminBookingsPage }   from './pages/admin/AdminBookingsPage';
import { AdminLoginPage }      from './pages/admin/AdminLoginPage';
import { AdminEstimatorPage }  from './pages/admin/AdminEstimatorPage';
import { AdminUsersPage }      from './pages/admin/AdminUsersPage';
import { DevLoginPage }        from './pages/DevLoginPage';
import { EstimatorPage }       from './pages/EstimatorPage';
import { EstimatorHistoryPage } from './pages/EstimatorHistoryPage';
import { MaidApplicationPage } from './pages/MaidApplicationPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/"               element={<HomePage />} />
          <Route path="/estimate"       element={<EstimatorPage />} />
          <Route path="/become-a-maid"  element={<MaidApplicationPage />} />
          <Route path="/auth/callback"  element={<AuthCallback />} />
          <Route path="/admin/login"    element={<AdminLoginPage />} />
          {import.meta.env.DEV && <Route path="/dev-login" element={<DevLoginPage />} />}

          {/* Any authenticated user */}
          <Route path="/dashboard"         element={<RequireRole><DashboardPage /></RequireRole>} />
          <Route path="/bookings"          element={<RequireRole><BookingsPage /></RequireRole>} />
          <Route path="/profile"           element={<RequireRole><ProfilePage /></RequireRole>} />
          <Route path="/estimate/history"  element={<RequireRole><EstimatorHistoryPage /></RequireRole>} />

          {/* Customer */}
          <Route path="/maids"      element={<RequireRole><MaidListPage /></RequireRole>} />
          <Route path="/maids/:maidId" element={<RequireRole><MaidDetailPage /></RequireRole>} />

          {/* Maid-only */}
          <Route path="/maid/setup"        element={<RequireRole roles={['MAID']}><MaidSetupPage /></RequireRole>} />
          <Route path="/maid/availability" element={<RequireRole roles={['MAID']}><AvailabilityPage /></RequireRole>} />
          <Route path="/maid/bookings"     element={<RequireRole roles={['MAID']}><MaidBookingsPage /></RequireRole>} />
          <Route path="/maid/earnings"     element={<RequireRole roles={['MAID']}><EarningsPage /></RequireRole>} />
          {/* Allow access to /maid/setup without MAID role so users can apply */}
          <Route path="/maid/apply"        element={<RequireRole><MaidSetupPage /></RequireRole>} />

          {/* Admin-only */}
          <Route path="/admin"               element={<RequireRole roles={['ADMIN']}><AdminDashboard /></RequireRole>} />
          <Route path="/admin/maids"         element={<RequireRole roles={['ADMIN']}><AdminMaidsPage /></RequireRole>} />
          <Route path="/admin/bookings"      element={<RequireRole roles={['ADMIN']}><AdminBookingsPage /></RequireRole>} />
          <Route path="/admin/estimator"     element={<RequireRole roles={['ADMIN']}><AdminEstimatorPage /></RequireRole>} />
          <Route path="/admin/users"         element={<RequireRole roles={['ADMIN']}><AdminUsersPage /></RequireRole>} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { FullPageSpinner } from '../ui/Spinner';

interface RequireRoleProps {
  children: React.ReactNode;
  roles?: string[];  // If empty/undefined, just requires authentication
}

/**
 * Route guard component.
 * Redirects unauthenticated users to / and unauthorized users to /dashboard.
 */
export function RequireRole({ children, roles }: RequireRoleProps) {
  const { isAuthenticated, isLoading, hasRole } = useAuth();
  const location = useLocation();

  if (isLoading) return <FullPageSpinner />;

  if (!isAuthenticated) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  if (roles && roles.length > 0) {
    const authorized = roles.some(r => hasRole(r));
    if (!authorized) {
      return <Navigate to="/dashboard" replace />;
    }
  }

  return <>{children}</>;
}

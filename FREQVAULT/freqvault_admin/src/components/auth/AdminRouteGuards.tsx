import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

const SessionBootstrapScreen = () => (
  <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
    <p className="text-sm text-muted-foreground">Checking admin session...</p>
  </div>
);

export const RequireAdminAuth = () => {
  const { isAuthenticated, isBootstrapping } = useAuth();
  const location = useLocation();

  if (isBootstrapping) return <SessionBootstrapScreen />;
  if (!isAuthenticated) {
    return <Navigate to="/admin" replace state={{ from: location }} />;
  }
  return <Outlet />;
};

export const RedirectIfAdminAuthenticated = () => {
  const { isAuthenticated, isBootstrapping } = useAuth();

  if (isBootstrapping) return <SessionBootstrapScreen />;
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
};

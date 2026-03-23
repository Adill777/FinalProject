import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { bootstrapUserSession, getUserToken, onUserAuthChange } from "@/lib/api";

const useUserAuthStatus = () => {
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(getUserToken()));

  useEffect(() => {
    let mounted = true;
    const sync = () => setIsAuthenticated(Boolean(getUserToken()));
    const unsubscribe = onUserAuthChange(sync);

    void bootstrapUserSession()
      .then(() => {
        if (!mounted) return;
        sync();
      })
      .finally(() => {
        if (!mounted) return;
        setIsBootstrapping(false);
      });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return { isBootstrapping, isAuthenticated };
};

const SessionBootstrapScreen = () => (
  <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
    <p className="text-sm text-muted-foreground">Checking secure session...</p>
  </div>
);

export const RequireUserAuth = () => {
  const location = useLocation();
  const { isBootstrapping, isAuthenticated } = useUserAuthStatus();

  if (isBootstrapping) return <SessionBootstrapScreen />;
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
};

export const RedirectIfUserAuthenticated = () => {
  const { isBootstrapping, isAuthenticated } = useUserAuthStatus();

  if (isBootstrapping) return <SessionBootstrapScreen />;
  if (isAuthenticated) {
    return <Navigate to="/files" replace />;
  }
  return <Outlet />;
};

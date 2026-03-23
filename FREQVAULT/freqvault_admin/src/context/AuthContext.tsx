import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
  bootstrapAdminSession,
  getAdminToken,
  logoutAdminSession,
  onAdminAuthChange,
  setAdminSession
} from "@/lib/api";

interface AuthContextType {
  isAuthenticated: boolean;
  isBootstrapping: boolean;
  login: (accessToken: string, email: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(Boolean(getAdminToken()));
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  const login = (accessToken: string, email: string) => {
    setAdminSession(accessToken, email);
    setIsAuthenticated(true);
    localStorage.setItem("isAuthenticated", "true");
  };

  const logout = () => {
    void logoutAdminSession();
    setIsAuthenticated(false);
  };

  useEffect(() => {
    const syncAuth = () => {
      setIsAuthenticated(Boolean(getAdminToken()));
    };

    void bootstrapAdminSession()
      .then(() => {
        syncAuth();
      })
      .finally(() => {
        setIsBootstrapping(false);
      });
    return onAdminAuthChange(syncAuth);
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, isBootstrapping, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

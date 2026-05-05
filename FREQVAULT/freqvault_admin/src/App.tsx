import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { SecurityCurtain } from "@/components/SecurityCurtain";
import { RedirectIfAdminAuthenticated, RequireAdminAuth } from "@/components/auth/AdminRouteGuards";
import { useDarkMode } from "@/hooks/use-dark-mode";

const queryClient = new QueryClient();
const Index = lazy(() => import("./pages/Index"));
const Login = lazy(() => import("./pages/Login"));
const NotFound = lazy(() => import("./pages/NotFound"));

const PortalFallback = () => (
  <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
    <div className="text-sm text-muted-foreground">Loading admin portal...</div>
  </div>
);

const App = () => {
  useDarkMode(); // ensure theme class applied on startup for admin
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <SecurityCurtain>
            <Suspense fallback={<PortalFallback />}>
              <BrowserRouter>
                <Routes>
                  <Route element={<RedirectIfAdminAuthenticated />}>
                    <Route path="/admin" element={<Login />} />
                    <Route path="/login" element={<Navigate to="/admin" replace />} />
                  </Route>
                  <Route element={<RequireAdminAuth />}>
                    <Route path="/" element={<Index />} />
                  </Route>
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </BrowserRouter>
            </Suspense>
          </SecurityCurtain>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { SecurityCurtain } from "@/components/SecurityCurtain";
import { RedirectIfAdminAuthenticated, RequireAdminAuth } from "@/components/auth/AdminRouteGuards";
import Index from "./pages/Index";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import { useDarkMode } from "@/hooks/use-dark-mode";

const queryClient = new QueryClient();

const App = () => {
  useDarkMode(); // ensure theme class applied on startup for admin
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <SecurityCurtain>
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
          </SecurityCurtain>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;

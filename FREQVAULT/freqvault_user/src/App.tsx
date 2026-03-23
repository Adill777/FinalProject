import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useDarkMode } from "@/hooks/use-dark-mode";
import { SecurityCurtain } from "@/components/SecurityCurtain";
import UserPortal from "./portals/UserPortal";

const queryClient = new QueryClient();

const App = () => {
  useDarkMode(); // ensure theme class is applied on startup
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <SecurityCurtain>
          <BrowserRouter>
            <Routes>
              <Route path="/*" element={<UserPortal />} />
            </Routes>
          </BrowserRouter>
        </SecurityCurtain>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;

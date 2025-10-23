// src/App.tsx
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { LiveProvider } from "@/context/LiveContext";
import { ActuatorSelectionProvider } from "@/context/ActuatorSelectionContext";

import Layout from "@/components/Layout";
import Index from "@/pages/Index";
import Monitoring from "@/pages/Monitoring";
import Analytics from "@/pages/Analytics";
import Alerts from "@/pages/Alerts";
import Simulation from "@/pages/Simulation";
import NotFound from "@/pages/NotFound";

// ⬇️ NOVO: popup global que ouve eventos emitGlobalAlert(...)
import GlobalAlertPopup from "@/components/GlobalAlertPopup";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <TooltipProvider delayDuration={250}>
          <LiveProvider>
            <ActuatorSelectionProvider>
              <BrowserRouter>
                <Routes>
                  <Route
                    path="/"
                    element={
                      <Layout title="Dashboard" description="">
                        <Index />
                      </Layout>
                    }
                  />
                  <Route
                    path="/monitoring"
                    element={
                      <Layout title="Monitoring" description="">
                        <Monitoring />
                      </Layout>
                    }
                  />
                  <Route
                    path="/analytics"
                    element={
                      <Layout title="Analytics" description="">
                        <Analytics />
                      </Layout>
                    }
                  />
                  <Route
                    path="/alerts"
                    element={
                      <Layout title="Alerts" description="">
                        <Alerts />
                      </Layout>
                    }
                  />
                  <Route
                    path="/simulation"
                    element={
                      <Layout title="Simulation" description="">
                        <Simulation />
                      </Layout>
                    }
                  />
                  <Route
                    path="*"
                    element={
                      <Layout title="Página não encontrada" description="">
                        <NotFound />
                      </Layout>
                    }
                  />
                </Routes>
              </BrowserRouter>

              {/* ⬇️ monta UMA vez: o Dialog é em Portal, cobre o site todo */}
              <GlobalAlertPopup />
            </ActuatorSelectionProvider>
          </LiveProvider>

          <Toaster />
          <Sonner />
        </TooltipProvider>
      </ThemeProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;

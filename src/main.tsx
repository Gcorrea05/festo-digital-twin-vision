import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

import { LiveProvider } from "@/context/LiveContext";
import { ActuatorSelectionProvider } from "@/context/ActuatorSelectionContext";

import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* Providers no topo → TODAS as rotas ficam cobertas */}
    <LiveProvider>
      <ActuatorSelectionProvider>
        <App />
      </ActuatorSelectionProvider>
    </LiveProvider>
  </React.StrictMode>
);

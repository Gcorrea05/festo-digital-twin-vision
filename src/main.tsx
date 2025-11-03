import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

import { LiveProvider } from "@/context/LiveContext";
import { ActuatorSelectionProvider } from "@/context/ActuatorSelectionContext";

import "./index.css";

const rootEl = document.getElementById("root")!;
const root = ReactDOM.createRoot(rootEl);

root.render(
  <React.StrictMode>
    <LiveProvider>
      <ActuatorSelectionProvider>
        <App />
      </ActuatorSelectionProvider>
    </LiveProvider>
  </React.StrictMode>
);

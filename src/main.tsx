import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

import { LiveProvider } from "@/context/LiveContext";
import { ActuatorSelectionProvider } from "@/context/ActuatorSelectionContext";

import "./index.css";

const rootEl = document.getElementById("root")!;
const root = ReactDOM.createRoot(rootEl);

root.render(
  <LiveProvider>
    <ActuatorSelectionProvider>
      <App />
    </ActuatorSelectionProvider>
  </LiveProvider>
);

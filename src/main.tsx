import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { PlatformAuthProvider } from "./platform/auth-context";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PlatformAuthProvider><App /></PlatformAuthProvider>
  </StrictMode>
);

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { I18nProvider } from "./i18n";
import { LocationProvider } from "./route";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("root missing");

createRoot(root).render(
  <StrictMode>
    <I18nProvider>
      <LocationProvider>
        <App />
      </LocationProvider>
    </I18nProvider>
  </StrictMode>,
);

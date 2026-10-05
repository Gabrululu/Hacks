import { I18nProvider } from "./i18n/I18n";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ConvexReactClient } from "convex/react";
import { AuthProvider } from "./features/auth/AuthProvider";
import App from "./App";
import "./styles.css";
import { convexUrl } from "./lib/backend";
const url = convexUrl;
const client = url ? new ConvexReactClient(url) : null;
const app = (
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider>
      <AuthProvider client={client}>{app}</AuthProvider>
    </I18nProvider>
  </React.StrictMode>,
);

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { AuthProvider } from "./context/AuthContext";
import { LocaleProvider } from "./context/LocaleContext";
import "./index.css";
import "./styles/rutrix-ui.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <LocaleProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </LocaleProvider>
  </ErrorBoundary>
);
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "@/app/providers/AuthProvider";
import { DomainDataProvider } from "@/app/providers/DomainDataProvider";
import AppRoutes from "@/app/router/AppRoutes";
import "@/assets/styles/index.css";
import "@/assets/styles/app.css";
import "@/assets/styles/multi-select.css";
import "@/modules/shared/modalScroll";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <DomainDataProvider>
          <AppRoutes />
        </DomainDataProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { ErrorBoundary } from "./components/error-boundary";
import { DemoProvider } from "./contexts/demo-context";
import { router } from "./router";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <DemoProvider>
        <RouterProvider router={router} />
      </DemoProvider>
    </ErrorBoundary>
  </StrictMode>
);

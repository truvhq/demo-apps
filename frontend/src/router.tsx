import { createBrowserRouter, Navigate } from "react-router";
import { HomePage } from "./pages/home";
import { DemoStepPage } from "./pages/demo-step";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <HomePage />,
  },
  {
    path: "/demos/:demoId",
    element: <Navigate to="0" replace />,
  },
  {
    path: "/demos/:demoId/:stepIndex",
    element: <DemoStepPage />,
  },
]);

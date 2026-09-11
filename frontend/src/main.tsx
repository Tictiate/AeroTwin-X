import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { AppDataProvider } from "./context/AppDataContext";
import Overview from "./pages/Overview";
import DigitalTwinPage from "./pages/DigitalTwinPage";
import Diagnostics from "./pages/Diagnostics";
import Reliability from "./pages/Reliability";
import Mission from "./pages/Mission";
import History from "./pages/History";
import "./styles/index.css";

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: "/", element: <Overview /> },
      { path: "/twin", element: <DigitalTwinPage /> },
      { path: "/diagnostics", element: <Diagnostics /> },
      { path: "/reliability", element: <Reliability /> },
      { path: "/mission", element: <Mission /> },
      { path: "/history", element: <History /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppDataProvider>
      <RouterProvider router={router} />
    </AppDataProvider>
  </React.StrictMode>,
);

import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AppShell } from "@/components/shell/AppShell";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { PlaceholderPage } from "./PlaceholderPage";

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "cases", element: <PlaceholderPage title="Cases" /> },
      { path: "approvals", element: <PlaceholderPage title="Approvals" /> },
      { path: "guidance", element: <PlaceholderPage title="Guidance Library" /> },
      { path: "reports", element: <PlaceholderPage title="Reports" /> },
      { path: "activity", element: <PlaceholderPage title="Activity Log" /> },
      { path: "settings", element: <PlaceholderPage title="Settings" /> },
      { path: "cases/:caseId", element: <PlaceholderPage title="Case detail" /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}

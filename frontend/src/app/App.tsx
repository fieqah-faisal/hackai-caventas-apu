import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AppShell } from "@/components/shell/AppShell";
import { ToastProvider } from "@/components/ui/Toast";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { PlaceholderPage } from "./PlaceholderPage";
import { NotFoundPage } from "./NotFoundPage";

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
  { path: "*", element: <NotFoundPage /> },
]);

export function App() {
  return (
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>
  );
}
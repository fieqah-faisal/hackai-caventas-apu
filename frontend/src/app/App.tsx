import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { AppShell } from "@/components/shell/AppShell";
import { ToastProvider } from "@/components/ui/Toast";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { CreateCasePage } from "@/features/createCase/CreateCasePage";
import { CasesPage } from "@/features/cases/CasesPage";
import { CaseWorkspace } from "@/features/caseWorkspace/CaseWorkspace";
import { OverviewTab } from "@/features/caseWorkspace/tabs/OverviewTab";
import { EvidenceTab } from "@/features/caseWorkspace/tabs/EvidenceTab";
import { TimelineTab } from "@/features/caseWorkspace/tabs/TimelineTab";
import { AnalysisTab } from "@/features/caseWorkspace/tabs/AnalysisTab";
import { ResponsePlanTab } from "@/features/caseWorkspace/tabs/ResponsePlanTab";
import { ApprovalsTab } from "@/features/caseWorkspace/tabs/ApprovalsTab";
import { ReportTab } from "@/features/caseWorkspace/tabs/ReportTab";
import { IncidentGraphTab } from "@/features/caseWorkspace/tabs/IncidentGraphTab";
import { AboutPage } from "./AboutPage";
import { NotFoundPage } from "./NotFoundPage";

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "cases/new", element: <CreateCasePage /> },
      {
        path: "cases/:caseId",
        element: <CaseWorkspace />,
        children: [
          { index: true, element: <OverviewTab /> },
          { path: "evidence", element: <EvidenceTab /> },
          { path: "timeline", element: <TimelineTab /> },
          { path: "graph", element: <IncidentGraphTab /> },
          { path: "analysis", element: <AnalysisTab /> },
          { path: "plan", element: <ResponsePlanTab /> },
          { path: "approvals", element: <ApprovalsTab /> },
          { path: "report", element: <ReportTab /> },
        ],
      },
      { path: "cases", element: <CasesPage /> },
      { path: "approvals", element: <Navigate replace to="/cases" /> },
      { path: "guidance", element: <Navigate replace to="/cases" /> },
      { path: "reports", element: <Navigate replace to="/cases" /> },
      { path: "activity", element: <Navigate replace to="/cases" /> },
      { path: "settings", element: <Navigate replace to="/cases" /> },
      { path: "about", element: <AboutPage /> },
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

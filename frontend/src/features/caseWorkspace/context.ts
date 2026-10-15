import { createContext, useContext } from "react";
import type { CaseFacts, CaseHeaderVM } from "@/lib/types";

export interface WorkspaceCtx {
  caseId: string;
  header: CaseHeaderVM;
  facts: CaseFacts;
  synthetic: boolean;
  refresh: () => void;
  reloadKey?: number;
}

export const WorkspaceContext = createContext<WorkspaceCtx | null>(null);

export function useWorkspace(): WorkspaceCtx {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within a CaseWorkspace");
  return ctx;
}

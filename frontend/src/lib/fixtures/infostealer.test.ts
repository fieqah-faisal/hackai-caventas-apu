import { describe, expect, it } from "vitest";
import {
  infostealerAnalysisBatch1,
  infostealerAnalysisBatch2,
  infostealerEvidenceBatch1,
  infostealerPlanV1Actions,
  infostealerPlanV2Actions,
} from "./infostealer";

const APPROVED_TOOLS = new Set([
  "isolate_host",
  "preserve_evidence",
  "reimage_host",
  "revoke_sessions",
  "reset_password",
  "disable_account",
  "remove_mail_forwarding_rule",
  "block_domain",
  "warn_staff",
]);
const POLICY_IDS = new Set(Array.from({ length: 19 }, (_, i) => `POL-${String(i + 1).padStart(2, "0")}`));
const ROLES = new Set(["soc_analyst", "it_manager", "dpo"]);
const ASSET_IDS = new Set(["SALES-LT-07", "FIN-LT-03", "CRM", "IDP", "MAIL", "VPN", "FS-01", "BKP-01"]);

describe("infostealer fixture conformance", () => {
  it("uses only guidance tool, policy, role and host-asset identifiers", () => {
    for (const action of [...infostealerPlanV1Actions, ...infostealerPlanV2Actions]) {
      expect(APPROVED_TOOLS.has(action.tool), action.tool).toBe(true);
      expect(ROLES.has(action.requiredApprover), action.requiredApprover).toBe(true);
      for (const policyId of action.policyRefs) expect(POLICY_IDS.has(policyId), policyId).toBe(true);
      if (action.target.startsWith("HOST::")) {
        expect(ASSET_IDS.has(action.target.slice("HOST::".length)), action.target).toBe(true);
      }
    }
  });

  it("uses the canonical infostealer asset/domain and excludes phishing mapping", () => {
    expect(infostealerEvidenceBatch1[0].fields.domain).toBe("pdf-editor-free.example");
    expect(infostealerAnalysisBatch1.affectedEntities[0].id).toBe("HOST::SALES-LT-07");
    expect(infostealerAnalysisBatch2.affectedEntities[0].id).toBe("HOST::SALES-LT-07");
    expect(infostealerAnalysisBatch1.attackTechniques).not.toContain("T1566.002");
    expect(infostealerAnalysisBatch2.attackTechniques).not.toContain("T1566.002");
  });
});

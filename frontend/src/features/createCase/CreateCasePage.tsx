import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getProvider } from "@/lib/api";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import { useDataMode } from "@/lib/useDataMode";
import { outcomeMessage } from "@/lib/useOutcome";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/icons/Icon";
import { SyntheticBadge } from "@/components/ui/SyntheticBadge";
import { useToast } from "@/components/ui/Toast";
import { cx } from "@/lib/types";
import type { StepId } from "@/lib/types";
import {
  STEP_LABEL,
  STEP_ORDER,
  addAcceptedFile,
  addClientRejected,
  confirmReview,
  editTitle,
  goTo,
  initialSetupState,
  markCaseCreated,
  markRunStarted,
  prerequisiteMet,
  prerequisiteReason,
  stepStatuses,
  titleValid,
  type SetupState,
} from "@/lib/setup/stepMachine";
import { DEMO_ORGANISATION } from "@/lib/scenario/config";
import { useAnalysisRuns } from "@/features/analysisRuns/AnalysisRunContext";

const p = getProvider();
const ACCEPTED = [".csv", ".json", ".txt"];
const MAX_BYTES = 10 * 1024 * 1024;

const SCENARIOS = [
  { id: "infostealer", title: "Infostealer to Session Hijack", badge: "Main demo", caseId: "CASE-INFOSTL01", sentence: "A fake PDF installer steals browser credentials and session cookies; later evidence shows the session was replayed to export 1,200 CRM records." },
  { id: "phishing", title: "Phishing to Account Takeover", badge: "Light scenario", caseId: "CASE-PHISH204", sentence: "A finance assistant enters credentials into a fake mailbox and approves an MFA prompt; the attacker adds a forwarding rule and phishes colleagues." },
  { id: "backup", title: "Planned Backup Migration", badge: "False alarm", caseId: "CASE-BACKUP118", sentence: "An approved 2am backup migration resembles credential guessing and exfiltration until the change ticket is supplied." },
];

export function CreateCasePage() {
  useDocumentTitle("Create new case");
  const navigate = useNavigate();
  const { notify } = useToast();
  const mode = useDataMode();
  const analysisRuns = useAnalysisRuns();
  const [s, setS] = useState<SetupState>(initialSetupState);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [sources, setSources] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [runPending, setRunPending] = useState(false);
  const runPendingRef = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const statuses = stepStatuses(s);

  async function createThenAdvance() {
    if (!titleValid(s.title)) return;
    setBusy(true);
    const out = await p.createCase(s.title.trim(), s.description.trim());
    setBusy(false);
    if (out.kind === "ok") {
      setCaseId(out.value.data.caseId);
      setS((prev) => goTo(markCaseCreated(prev), "evidence"));
    } else {
      notify({ tone: "error", title: "Could not create the case", detail: outcomeMessage(out) });
    }
  }

  async function onFiles(files: FileList | null) {
    if (!files || !caseId) return;
    for (const file of Array.from(files)) {
      const ext = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
      if (!ACCEPTED.includes(ext)) {
        setS((prev) => addClientRejected(prev));
        notify({ tone: "error", title: "File rejected", detail: `${file.name}: only CSV, JSON, TXT are accepted.` });
        continue;
      }
      if (file.size > MAX_BYTES) {
        setS((prev) => addClientRejected(prev));
        notify({ tone: "error", title: "File too large", detail: `${file.name}: exceeds 10 MB.` });
        continue;
      }
      setBusy(true);
      const out = await p.uploadEvidence(caseId, file);
      setBusy(false);
      if (out.kind === "ok") {
        setS((prev) => addAcceptedFile(prev));
        setSources((prev) => (prev.includes(file.name) ? prev : [...prev, file.name]));
      } else {
        setS((prev) => addClientRejected(prev));
        notify({ tone: "error", title: "Upload rejected", detail: `${file.name}: ${outcomeMessage(out)}` });
      }
    }
  }

  async function start() {
    if (!caseId) return;
    if (s.runStarted || runPendingRef.current) return;
    runPendingRef.current = true;
    setRunPending(true);
    setBusy(true);
    const run = await analysisRuns.start(caseId);
    setBusy(false);
    setRunPending(false);
    runPendingRef.current = false;
    if (run) {
      setS((prev) => markRunStarted(prev));
      notify({ tone: "info", title: "Analysis queued", detail: "Follow the persisted agent progress in the case workspace." });
      navigate(`/cases/${caseId}/analysis`);
    } else {
      notify({ tone: "error", title: "Could not start analysis", detail: analysisRuns.getEntry(caseId).error ?? "The analysis run could not be started." });
    }
  }

  function loadScenario(targetCaseId: string, title: string) {
    // In fixture mode, demo scenarios open the prebuilt synthetic case directly.
    if (mode === "fixture") {
      navigate(`/cases/${targetCaseId}`);
      return;
    }
    // In API mode, prefill the title; the analyst still uploads real evidence.
    setS((prev) => editTitle(prev, title));
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_26rem]">
      {/* Left: scenario picker + context */}
      <div className="space-y-5">
        <header>
          <p className="mono text-eyebrow uppercase text-text-muted">New case</p>
          <h1 className="mt-1.5 text-title font-bold text-text-primary">Create a case</h1>
          <p className="mt-2 text-desc text-text-secondary">
            Enter case details, add evidence, review what was ingested, then start the analysis.
          </p>
        </header>

        <section className="rounded-md border border-border-subtle bg-surface p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-text-primary">Load demo scenario</h2>
            {mode === "fixture" && <SyntheticBadge />}
          </div>
          <p className="mt-1 text-meta text-text-muted">
            Demonstration helper — not a production SOC feature. Organisation: {DEMO_ORGANISATION}.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {SCENARIOS.map((sc) => (
              <button
                key={sc.id}
                onClick={() => loadScenario(sc.caseId, sc.title)}
                className="flex flex-col gap-2 rounded-md border border-border-subtle bg-canvas p-3 text-left hover:border-border-strong hover:bg-surface-hover transition-colors duration-180"
              >
                <span className={cx("inline-flex w-fit rounded border px-1.5 py-0.5 text-2xs font-medium", sc.badge === "Main demo" ? "border-accent/40 text-accent" : sc.badge === "False alarm" ? "border-status-info/40 text-status-info" : "border-border-subtle text-text-muted")}>
                  {sc.badge}
                </span>
                <span className="text-base font-medium text-text-primary">{sc.title}</span>
                <span className="text-meta text-text-muted">{sc.sentence}</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* Right: setup panel */}
      <aside className="rounded-md border border-border-subtle bg-surface">
        <ol className="divide-y divide-border-subtle">
          {STEP_ORDER.map((step, i) => (
            <StepRow
              key={step}
              step={step}
              index={i}
              status={statuses[step]}
              active={s.active === step}
              enabled={prerequisiteMet(step, s) || s.active === step || statuses[step] === "complete"}
              reason={prerequisiteReason(step, s)}
              onSelect={() => setS((prev) => goTo(prev, step))}
            >
              {s.active === step && (
                <StepBody
                  step={step}
                  s={s}
                  setS={setS}
                  busy={busy}
                  runPending={runPending}
                  sources={sources}
                  caseId={caseId}
                  onCreate={createThenAdvance}
                  onPickFiles={() => fileInput.current?.click()}
                  onConfirmReview={() => setS((prev) => goTo(confirmReview(prev), "start"))}
                  onStart={start}
                />
              )}
            </StepRow>
          ))}
        </ol>
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPTED.join(",")}
          multiple
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
      </aside>
    </div>
  );
}

function StepRow({
  step, index, status, active, enabled, reason, onSelect, children,
}: {
  step: StepId; index: number; status: string; active: boolean; enabled: boolean;
  reason: string; onSelect: () => void; children: React.ReactNode;
}) {
  return (
    <li className="p-4">
      <button
        onClick={onSelect}
        disabled={!enabled}
        aria-disabled={!enabled || undefined}
        className={cx("flex w-full items-center gap-3 text-left", !enabled && "cursor-not-allowed")}
      >
        <span className={cx(
          "grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs font-semibold",
          status === "complete" ? "border-accent/50 bg-accent/10 text-accent" : active ? "border-accent text-accent" : "border-border-strong text-text-muted",
        )}>
          {status === "complete" ? <Icon name="success" size={18} /> : index + 1}
        </span>
        <span className={cx("text-base font-medium", active ? "text-text-primary" : enabled ? "text-text-secondary" : "text-text-muted")}>
          {STEP_LABEL[step]}
        </span>
      </button>
      {!enabled && !active && reason && <p className="ml-9 mt-1 text-meta text-text-muted">{reason}</p>}
      {active && <div className="ml-9 mt-3">{children}</div>}
    </li>
  );
}

function StepBody({
  step, s, setS, busy, runPending, sources, caseId, onCreate, onPickFiles, onConfirmReview, onStart,
}: {
  step: StepId; s: SetupState; setS: React.Dispatch<React.SetStateAction<SetupState>>;
  busy: boolean; runPending: boolean; sources: string[]; caseId: string | null;
  onCreate: () => void; onPickFiles: () => void; onConfirmReview: () => void; onStart: () => void;
}) {
  if (step === "details") {
    return (
      <div className="space-y-3">
        <label className="block">
          <span className="text-meta text-text-muted">Case title</span>
          <input
            value={s.title}
            disabled={s.caseCreated}
            onChange={(e) => setS((prev) => editTitle(prev, e.target.value))}
            maxLength={240}
            className="mt-1 w-full rounded border border-border-subtle bg-canvas px-2.5 h-9 text-base text-text-primary disabled:opacity-60 focus:border-border-strong focus-visible:outline-none"
            placeholder="e.g. Infostealer on sales laptop"
          />
        </label>
        <label className="block">
          <span className="text-meta text-text-muted">Short description</span>
          <textarea
            value={s.description}
            disabled={s.caseCreated}
            onChange={(e) => setS((prev) => ({ ...prev, description: e.target.value }))}
            rows={2}
            className="mt-1 w-full rounded border border-border-subtle bg-canvas p-2.5 text-base text-text-primary disabled:opacity-60 focus:border-border-strong focus-visible:outline-none"
          />
        </label>
        <label className="block">
          <span className="text-meta text-text-muted">Analyst note (draft only; add as TXT evidence to store it)</span>
          <textarea
            value={s.analystNote}
            onChange={(e) => setS((prev) => ({ ...prev, analystNote: e.target.value }))}
            rows={2}
            className="mt-1 w-full rounded border border-border-subtle bg-canvas p-2.5 text-base text-text-primary focus:border-border-strong focus-visible:outline-none"
          />
        </label>
        {s.caseCreated ? (
          <p className="text-meta text-text-muted">
            Case created — title and description are now read-only (there is no edit endpoint).
          </p>
        ) : (
          <Button variant="primary" size="sm" disabled={!titleValid(s.title) || busy} onClick={onCreate}>
            Create case & continue
          </Button>
        )}
      </div>
    );
  }
  if (step === "evidence") {
    return (
      <div className="space-y-3">
        <p className="text-meta text-text-muted">Accepted formats: CSV, JSON, TXT (max 10 MB each).</p>
        <Button variant="secondary" size="sm" onClick={onPickFiles} disabled={busy} leadingIcon={<Icon name="evidence" size={18} />}>
          Add evidence files
        </Button>
        <div className="text-meta text-text-secondary">
          Accepted files: <span className="tnum">{s.acceptedFileCount}</span>
          {s.clientRejectedCount > 0 && <span className="text-text-muted"> · {s.clientRejectedCount} rejected (client-side)</span>}
        </div>
        {sources.length > 0 && (
          <ul className="space-y-1">
            {sources.map((src) => (
              <li key={src} className="flex items-center gap-2 text-meta text-text-secondary">
                <Icon name="file" size={18} className="text-text-muted" /> {src}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  if (step === "review") {
    return <ReviewBody caseId={caseId} clientRejected={s.clientRejectedCount} onConfirm={onConfirmReview} />;
  }
  // start
  return (
    <div className="space-y-3">
      <dl className="space-y-1 text-meta text-text-secondary">
        <div className="flex justify-between"><dt className="text-text-muted">Case</dt><dd>{s.title}</dd></div>
        <div className="flex justify-between"><dt className="text-text-muted">Evidence sources</dt><dd className="tnum">{sources.length}</dd></div>
        <div className="flex justify-between"><dt className="text-text-muted">Accepted records</dt><dd className="tnum">{s.acceptedFileCount}</dd></div>
      </dl>
      <Button variant="primary" size="sm" disabled={busy || runPending || s.runStarted} onClick={onStart} leadingIcon={<Icon name="running" size={18} />}>
        {s.runStarted ? "Analysis started" : runPending ? "Analyzing evidence…" : "Start analysis"}
      </Button>
      {runPending && <p role="status" className="text-meta text-text-muted">Requesting a persisted analysis run…</p>}
    </div>
  );
}

function ReviewBody({ caseId, clientRejected, onConfirm }: { caseId: string | null; clientRejected: number; onConfirm: () => void }) {
  const [data, setData] = useState<{ count: number; sources: string[] } | null>(null);
  const [showTech, setShowTech] = useState(false);

  // Load the real accepted counts/sources from the provider.
  useEffect(() => {
    if (!caseId) return;
    let alive = true;
    p.countEvidence(caseId).then((o) => {
      if (alive && o.kind === "ok") setData(o.value.data);
    });
    return () => { alive = false; };
  }, [caseId]);

  return (
    <div className="space-y-3">
      <dl className="space-y-1 text-meta text-text-secondary">
        <div className="flex justify-between"><dt className="text-text-muted">Accepted records</dt><dd className="tnum">{data?.count ?? "…"}</dd></div>
        <div className="flex justify-between"><dt className="text-text-muted">Detected sources</dt><dd className="tnum">{data?.sources.length ?? "…"}</dd></div>
        <div className="flex justify-between"><dt className="text-text-muted">Client-rejected</dt><dd className="tnum">{clientRejected}</dd></div>
      </dl>
      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button onClick={() => setShowTech((v) => !v)} className="text-left text-meta text-status-info hover:underline">
          {showTech ? "Hide" : "Show"} hash & ingestion detail
        </button>
        <Button variant="primary" size="sm" onClick={onConfirm}>Confirm review & continue</Button>
      </div>
      {showTech && (
        <p className="text-meta text-text-muted">
          SHA-256 and ingestion status are available per record on the case Evidence tab.
        </p>
      )}
    </div>
  );
}

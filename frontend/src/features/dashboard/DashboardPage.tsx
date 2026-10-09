import { useNavigate } from "react-router-dom";
import { Icon, type IconName } from "@/components/icons/Icon";
import { Region } from "@/components/ui/Region";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SyntheticBadge } from "@/components/ui/SyntheticBadge";
import { AsyncBoundary } from "@/components/ui/AsyncBoundary";
import { Skeleton } from "@/components/ui/Skeleton";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import { useOutcome } from "@/lib/useOutcome";
import { getProvider } from "@/lib/api";
import { caseStatusLabel, relativeTime, stageLabel } from "@/lib/format";
import { STAGE_ORDER, cx } from "@/lib/types";
import type {
  AgentPlanningVM,
  AttentionItem,
  CaseActivityVM,
  HumanDecisionsVM,
  RecentCaseRow,
} from "@/lib/types";

const p = getProvider();

export function DashboardPage() {
  useDocumentTitle("Dashboard");

  const activity = useOutcome<CaseActivityVM>(() => p.getCaseActivity());
  const planning = useOutcome<AgentPlanningVM>(() => p.getAgentPlanning());
  const decisions = useOutcome<HumanDecisionsVM>(() => p.getHumanDecisions());
  const attention = useOutcome<AttentionItem[]>(() => p.getAttentionItems());
  const recent = useOutcome<RecentCaseRow[]>(() => p.getRecentCases());

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-title font-bold text-text-primary">Dashboard</h1>
          <p className="mt-2 text-desc text-text-secondary">
            SOC operations: incident activity and decisions requiring attention.
          </p>
        </div>
        {p.synthetic && <SyntheticBadge />}
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <CaseActivityCard outcome={activity} />
        <AgentPlanningCard outcome={planning} />
        <HumanDecisionsCard outcome={decisions} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <NeedsAttention outcome={attention} />
        </div>
        <div className="xl:col-span-5">
          <RecentCases outcome={recent} />
        </div>
      </div>
    </div>
  );
}

function Card({
  title,
  icon,
  to,
  cta,
  children,
}: {
  title: string;
  icon: IconName;
  to: string;
  cta: string;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <section className="flex flex-col rounded-md border border-border-subtle bg-surface p-5">
      <div className="flex items-center gap-2">
        <Icon name={icon} size={20} className="text-text-muted" />
        <h2 className="text-base font-semibold text-text-primary">{title}</h2>
      </div>
      <div className="mt-4 flex-1">{children}</div>
      <button
        onClick={() => navigate(to)}
        className="mt-4 inline-flex items-center gap-1 self-start text-sm font-medium text-text-secondary hover:text-text-primary"
      >
        {cta} <Icon name="arrowRight" size={18} />
      </button>
    </section>
  );
}

function Metric({ value, label, tone = "default" }: { value: string | number; label: string; tone?: "default" | "warning" }) {
  return (
    <div>
      <div className={cx("tnum text-metric font-bold leading-none", tone === "warning" ? "text-status-warning" : "text-text-primary")}>
        {value}
      </div>
      <div className="mt-1 text-meta text-text-muted">{label}</div>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-9 w-16" />
      <Skeleton className="h-3 w-28" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

function CaseActivityCard({ outcome }: { outcome: ReturnType<typeof useOutcome<CaseActivityVM>> }) {
  return (
    <Card title="Case activity" icon="cases" to="/cases" cta="View cases">
      {outcome.state === "loading" ? (
        <CardSkeleton />
      ) : outcome.state === "error" || !outcome.value ? (
        <p className="text-meta text-status-danger">Could not load case activity.</p>
      ) : (
        <ActivityBody data={outcome.value.data} />
      )}
    </Card>
  );
}

function ActivityBody({ data }: { data: CaseActivityVM }) {
  const max = Math.max(1, ...data.buckets.map((b) => b.count));
  const hasData = data.buckets.some((b) => b.count > 0);
  return (
    <div className="space-y-4">
      <div className="flex items-end gap-6">
        <Metric value={data.openCases} label="Open cases" />
        <Metric value={data.attentionCases} label="Need attention" tone={data.attentionCases > 0 ? "warning" : "default"} />
      </div>
      {hasData ? (
        <div
          className="flex h-14 items-end gap-1.5"
          role="img"
          aria-label={`7-day activity: ${data.buckets.map((b) => b.count).join(", ")}`}
        >
          {data.buckets.map((b) => (
            <div key={b.date} className="flex-1" title={`${b.date}: ${b.count}`}>
              <div
                className="w-full rounded-sm bg-border-strong"
                style={{ height: `${Math.max(6, (b.count / max) * 48)}px` }}
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-meta text-text-muted">No recorded activity in the last 7 days.</p>
      )}
    </div>
  );
}

function AgentPlanningCard({ outcome }: { outcome: ReturnType<typeof useOutcome<AgentPlanningVM>> }) {
  return (
    <Card title="Agent planning" icon="analysis" to="/activity" cta="View activity">
      {outcome.state === "loading" ? (
        <CardSkeleton />
      ) : outcome.state === "error" || !outcome.value ? (
        <p className="text-meta text-status-danger">Could not load agent planning.</p>
      ) : (
        <PlanningBody data={outcome.value.data} />
      )}
    </Card>
  );
}

function PlanningBody({ data }: { data: AgentPlanningVM }) {
  const maxStage = Math.max(1, ...data.stageDistribution.map((s) => s.count));
  return (
    <div className="space-y-4">
      <div className="flex items-end gap-6">
        <div>
          <div className="flex items-baseline gap-1.5">
            <span className="tnum text-metric font-bold leading-none text-text-primary">{data.activeRuns}</span>
            {data.runCountsSource === "synthetic" && (
              <span className="rounded border border-border-subtle px-1 text-2xs text-text-muted">synthetic</span>
            )}
          </div>
          <div className="mt-1 text-meta text-text-muted">Active runs</div>
        </div>
        <Metric value={data.blockedRuns} label="Blocked" tone={data.blockedRuns > 0 ? "warning" : "default"} />
      </div>
      <ul className="space-y-1.5">
        {STAGE_ORDER.filter((s) => data.stageDistribution.find((d) => d.stage === s && d.count > 0)).slice(0, 4).map((s) => {
          const count = data.stageDistribution.find((d) => d.stage === s)?.count ?? 0;
          return (
            <li key={s} className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-meta text-text-secondary">{stageLabel[s]}</span>
              <span className="h-1.5 rounded-full bg-status-info" style={{ width: `${(count / maxStage) * 100}%`, minWidth: "8px" }} />
              <span className="tnum text-meta text-text-muted">{count}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function HumanDecisionsCard({ outcome }: { outcome: ReturnType<typeof useOutcome<HumanDecisionsVM>> }) {
  return (
    <Card title="Human decisions" icon="humanDecision" to="/approvals" cta="Review approvals">
      {outcome.state === "loading" ? (
        <CardSkeleton />
      ) : outcome.state === "error" || !outcome.value ? (
        <p className="text-meta text-status-danger">Could not load human decisions.</p>
      ) : (
        <DecisionsBody data={outcome.value.data} />
      )}
    </Card>
  );
}

function DecisionsBody({ data }: { data: HumanDecisionsVM }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <Metric value={data.awaitingApproval} label="Awaiting approval" tone={data.awaitingApproval > 0 ? "warning" : "default"} />
        <Metric value={data.highImpactEscalations} label="High-impact" tone={data.highImpactEscalations > 0 ? "warning" : "default"} />
        <Metric value={data.oldestWaiting ?? "—"} label="Oldest waiting" />
      </div>
      <div className="flex gap-1.5">
        {data.riskDistribution.map((r) => (
          <StatusBadge key={r.risk} tone={r.risk === "high" ? "danger" : r.risk === "moderate" ? "warning" : "neutral"}>
            {r.count} {r.risk}
          </StatusBadge>
        ))}
      </div>
    </div>
  );
}

function NeedsAttention({ outcome }: { outcome: ReturnType<typeof useOutcome<AttentionItem[]>> }) {
  const navigate = useNavigate();
  return (
    <Region
      title="Cases requiring attention"
      busy={outcome.state === "loading"}
      action={
        <button onClick={() => navigate("/cases")} className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary">
          View all <Icon name="arrowRight" size={18} />
        </button>
      }
    >
      <AsyncBoundary
        outcome={outcome}
        skeletonRows={3}
        emptyWhen={(d) => d.length === 0}
        emptyTitle="Nothing needs attention right now"
        emptyHint="Cases surface here when a decision is pending, evidence is missing, or a replan is needed."
      >
        {(items) => (
          <ul>
            {items.slice(0, 3).map((it) => (
              <li key={it.caseId}>
                <button
                  onClick={() => navigate(`/cases/${it.caseId}`)}
                  className="group flex w-full items-center gap-3 border-b border-border-subtle px-4 py-3 text-left last:border-b-0 hover:bg-surface-hover transition-colors duration-180"
                >
                  <Icon name="warning" size={20} className="text-status-warning" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-medium text-text-primary">{it.title}</span>
                    <span className="text-meta text-text-muted">{relativeTime(it.updatedAt)}</span>
                  </span>
                  <StatusBadge tone="warning">{it.statusLabel}</StatusBadge>
                  <Icon name="chevronRight" size={18} className="text-text-muted group-hover:text-text-secondary" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </AsyncBoundary>
    </Region>
  );
}

function RecentCases({ outcome }: { outcome: ReturnType<typeof useOutcome<RecentCaseRow[]>> }) {
  const navigate = useNavigate();
  return (
    <Region title="Recent cases" busy={outcome.state === "loading"}>
      <AsyncBoundary
        outcome={outcome}
        skeletonRows={4}
        emptyWhen={(d) => d.length === 0}
        emptyTitle="No recent cases"
      >
        {(rows) => (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-base">
              <thead>
                <tr className="border-b border-border-subtle text-meta text-text-muted">
                  <th className="px-4 py-2 font-medium">Case</th>
                  <th className="px-4 py-2 font-medium">Stage</th>
                  <th className="px-4 py-2 font-medium">Updated</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 5).map((r) => (
                  <tr
                    key={r.caseId}
                    onClick={() => navigate(`/cases/${r.caseId}`)}
                    className="cursor-pointer border-b border-border-subtle last:border-b-0 hover:bg-surface-hover"
                  >
                    <td className="max-w-[16rem] truncate px-4 py-2.5 text-text-primary">{r.title}</td>
                    <td className="px-4 py-2.5 text-text-secondary">{r.stage ? stageLabel[r.stage] : "—"}</td>
                    <td className="px-4 py-2.5 text-meta text-text-muted">{relativeTime(r.updatedAt)}</td>
                    <td className="px-4 py-2.5"><StatusBadge>{caseStatusLabel[r.status]}</StatusBadge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AsyncBoundary>
    </Region>
  );
}
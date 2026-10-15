import { useMemo, useState } from "react";
import { relativeTime, readableValue } from "@/lib/format";
import type { TimelineEventVM } from "@/lib/types";
import { Mono } from "./Mono";
import { StatusBadge } from "./StatusBadge";

function unique(events: TimelineEventVM[], value: (event: TimelineEventVM) => string) {
  return [...new Set(events.map(value).filter(Boolean))].sort();
}

function exactTime(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Not recorded";
}

function TechnicalDetails({ event }: { event: TimelineEventVM }) {
  const details = Object.entries(event.details ?? {});
  if (!details.length && !event.rawDescription) return null;
  return (
    <details className="mt-2 text-2xs text-text-muted">
      <summary className="cursor-pointer select-none hover:text-text-primary">Technical details</summary>
      {!!details.length && <dl className="mt-2 grid gap-1 sm:grid-cols-[max-content_1fr]">{details.map(([key, value]) => <div key={key} className="contents"><dt>{readableValue(key)}</dt><dd className="min-w-0 break-words font-mono text-text-secondary">{value}</dd></div>)}</dl>}
      {event.rawDescription && <p className="mt-2 overflow-x-auto whitespace-pre-wrap break-words font-mono text-text-secondary">{event.rawDescription}</p>}
    </details>
  );
}

function EvidenceLinks({ caseId, ids }: { caseId: string; ids: string[] }) {
  if (!ids.length) return <span className="text-text-muted">None</span>;
  return <div className="flex max-w-64 flex-wrap gap-1">{ids.map((id) => <a key={id} href={`/cases/${encodeURIComponent(caseId)}/evidence?evidence=${encodeURIComponent(id)}`} className="max-w-full hover:text-accent"><Mono className="max-w-full break-normal">{id}</Mono></a>)}</div>;
}

export function TimelineTable({ caseId, events }: { caseId: string; events: TimelineEventVM[] }) {
  const [order, setOrder] = useState<"oldest" | "newest">("oldest");
  const [eventType, setEventType] = useState("");
  const [source, setSource] = useState("");
  const [relevance, setRelevance] = useState("");
  const [status, setStatus] = useState("");
  const eventTypes = useMemo(() => unique(events, (event) => event.eventType ?? "legacy_event"), [events]);
  const sources = useMemo(() => unique(events, (event) => event.source ?? "unknown"), [events]);
  const relevances = useMemo(() => unique(events, (event) => event.relevance ?? "unknown"), [events]);
  const rows = useMemo(() => events
    .filter((event) => !eventType || (event.eventType ?? "legacy_event") === eventType)
    .filter((event) => !source || (event.source ?? "unknown") === source)
    .filter((event) => !relevance || (event.relevance ?? "unknown") === relevance)
    .filter((event) => !status || event.relationshipStatus === status)
    .sort((a, b) => {
      if (!a.time && !b.time) return a.id.localeCompare(b.id);
      if (!a.time) return 1;
      if (!b.time) return -1;
      const comparison = new Date(a.time).getTime() - new Date(b.time).getTime() || a.id.localeCompare(b.id);
      return order === "oldest" ? comparison : -comparison;
    }), [events, eventType, source, relevance, status, order]);

  return (
    <div>
      <div className="grid gap-2 border-b border-border-subtle p-3 sm:grid-cols-2 xl:grid-cols-5">
        <label className="text-2xs uppercase tracking-wide text-text-muted">Order<select aria-label="Timeline order" value={order} onChange={(event) => setOrder(event.target.value as typeof order)} className="mt-1 w-full rounded border border-border-strong bg-surface-raised px-2 py-1.5 text-sm normal-case text-text-primary"><option value="oldest">Oldest first</option><option value="newest">Newest first</option></select></label>
        <Filter label="Event type" value={eventType} values={eventTypes} onChange={setEventType} />
        <Filter label="Source" value={source} values={sources} onChange={setSource} />
        <Filter label="Relevance" value={relevance} values={relevances} onChange={setRelevance} />
        <Filter label="Status" value={status} values={["observed", "inferred"]} onChange={setStatus} />
      </div>
      {!rows.length && <p className="p-5 text-meta text-text-muted">No timeline events match the selected filters.</p>}
      {!!rows.length && <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[980px] border-collapse text-left text-meta">
          <thead><tr className="border-b border-border-strong bg-surface-raised text-2xs uppercase tracking-wide text-text-muted"><th className="px-3 py-2">Time</th><th className="px-3 py-2">Event</th><th className="px-3 py-2">Actor / entity</th><th className="px-3 py-2">Source</th><th className="px-3 py-2">Result</th><th className="px-3 py-2">Evidence</th><th className="px-3 py-2">Relevance</th></tr></thead>
          <tbody>{rows.map((event) => <tr key={event.id} className="border-b border-border-subtle align-top last:border-0"><td className="whitespace-nowrap px-3 py-3"><time dateTime={event.time ?? undefined} className="block font-mono text-2xs text-text-primary">{exactTime(event.time)}</time>{event.time && <span className="mt-1 block text-2xs text-text-muted">{relativeTime(event.time)}</span>}</td><td className="max-w-sm px-3 py-3"><span className="block font-semibold text-text-primary">{readableValue(event.eventType)}</span><span className="mt-0.5 block leading-5 text-text-secondary">{event.label}</span><TechnicalDetails event={event} /></td><td className="max-w-56 px-3 py-3 font-mono text-2xs text-text-secondary">{[event.actor, event.subject, ...(event.entityIds ?? [])].filter(Boolean).join(", ") || "Not established"}</td><td className="px-3 py-3 text-text-secondary">{readableValue(event.source)}</td><td className="max-w-48 px-3 py-3 text-text-secondary">{event.result || "Not established"}</td><td className="px-3 py-3"><EvidenceLinks caseId={caseId} ids={event.evidenceIds ?? (event.evidenceId ? [event.evidenceId] : [])} /></td><td className="px-3 py-3"><StatusBadge>{readableValue(event.relevance)}</StatusBadge><span className="mt-1 block text-2xs text-text-muted">{readableValue(event.relationshipStatus)}</span></td></tr>)}</tbody>
        </table>
      </div>}
      <div className="divide-y divide-border-subtle md:hidden">{rows.map((event) => <article key={event.id} className="p-4"><div className="flex items-start justify-between gap-2"><div><p className="font-semibold text-text-primary">{readableValue(event.eventType)}</p><time dateTime={event.time ?? undefined} className="text-2xs text-text-muted">{exactTime(event.time)}</time></div><StatusBadge>{readableValue(event.relevance)}</StatusBadge></div><p className="mt-2 text-sm leading-5 text-text-secondary">{event.label}</p><dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-meta"><dt className="text-text-muted">Actor / entity</dt><dd className="break-words text-text-secondary">{event.actor || event.subject || "Not established"}</dd><dt className="text-text-muted">Source</dt><dd>{readableValue(event.source)}</dd><dt className="text-text-muted">Result</dt><dd>{event.result || "Not established"}</dd><dt className="text-text-muted">Evidence</dt><dd><EvidenceLinks caseId={caseId} ids={event.evidenceIds ?? (event.evidenceId ? [event.evidenceId] : [])} /></dd></dl><TechnicalDetails event={event} /></article>)}</div>
    </div>
  );
}

function Filter({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
  return <label className="text-2xs uppercase tracking-wide text-text-muted">{label}<select aria-label={`Filter by ${label.toLowerCase()}`} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded border border-border-strong bg-surface-raised px-2 py-1.5 text-sm normal-case text-text-primary"><option value="">All</option>{values.map((item) => <option key={item} value={item}>{readableValue(item)}</option>)}</select></label>;
}

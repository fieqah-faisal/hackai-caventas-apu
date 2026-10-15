import { useDocumentTitle } from "@/lib/useDocumentTitle";
import caventasLogo from "@/assets/Caventas-logo.png";

const capabilities = [
  {
    title: "Evidence intake",
    description: "Accepts synthetic evidence from multiple security sources and supports additional evidence throughout an investigation.",
  },
  {
    title: "Incident reconstruction",
    description: "Builds a versioned incident timeline and GAS-lite relationship graph while preserving evidence provenance and state history.",
  },
  {
    title: "Agent-assisted analysis",
    description: "Classifies the incident, identifies findings, retrieves approved guidance and produces evidence-backed proposed actions.",
  },
  {
    title: "Human-controlled response",
    description: "Requires analyst approval before simulated actions and records reviews, approvals, rejections and validation results.",
  },
  {
    title: "Continuous replanning",
    description: "Detects when new evidence makes an existing plan stale and generates a new plan against the latest incident state.",
  },
  {
    title: "Structured reporting",
    description: "Produces persistent web reports and downloadable PDFs, separating agent decisions, analyst activity and action outcomes.",
  },
];

const team = [
  "Syafieqah Binti Ahmad Shukri",
  "Aida Batrisya Binti Ramlee",
  "Al-Aidan Iszdehar Farrn Bin Ismail Faizal",
  "Airil Hakimi bin Anuar",
  "Raajshreedhar Sathia Murthy",
];

export function AboutPage() {
  useDocumentTitle("About");
  return (
    <div className="mx-auto w-full max-w-5xl space-y-10">
      <section className="grid items-center gap-6 rounded-md border border-border-subtle bg-shell p-5 sm:grid-cols-[minmax(0,1fr)_12rem] sm:p-8">
        <div>
          <p className="mono text-eyebrow uppercase text-text-muted">About Caventas</p>
          <h1 className="mt-1 text-title font-bold text-text-primary">Caventas</h1>
          <p className="mt-2 text-lg font-medium text-accent">Agentic incident-response planning with human control.</p>
          <div className="mt-4 max-w-3xl space-y-3 text-base leading-7 text-text-secondary">
            <p>Caventas is a human-in-the-loop incident-response workspace designed to help Tier 1 and junior Tier 2 SOC analysts turn fragmented security evidence into an understandable, evidence-backed investigation.</p>
            <p>It reconstructs an evolving incident state, connects related entities and activity, recommends bounded response actions, and keeps analysts in control through explicit review and approval. All prototype actions are simulated, traceable and bound to the incident-state version used to produce the plan.</p>
          </div>
        </div>
        <div className="mx-auto w-full max-w-48">
          <img src={caventasLogo} alt="Caventas logo" className="h-auto w-full object-contain" />
        </div>
      </section>

      <section aria-labelledby="capabilities-heading">
        <div className="mb-4">
          <p className="mono text-eyebrow uppercase text-text-muted">Investigation workflow</p>
          <h2 id="capabilities-heading" className="mt-1 text-lg font-semibold text-text-primary">What Caventas does</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {capabilities.map((capability) => (
            <article key={capability.title} className="min-w-0 rounded-md border border-border-subtle bg-surface p-5">
              <h3 className="text-base font-semibold text-text-primary">{capability.title}</h3>
              <p className="mt-2 text-meta leading-6 text-text-secondary">{capability.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-label="Safety statement" className="rounded-md border border-accent/35 bg-shell p-5 sm:p-6">
        <p className="mono text-eyebrow uppercase text-accent">Human control and safety</p>
        <p className="mt-2 max-w-4xl text-base leading-7 text-text-primary">Caventas is a defensive prototype. It uses synthetic incident data and bounded simulated actions. Agent output is advisory and does not replace analyst judgement or authorization.</p>
      </section>

      <section aria-labelledby="team-heading" className="rounded-md border border-border-subtle bg-surface p-5 sm:p-6">
        <p className="mono text-eyebrow uppercase text-text-muted">The people behind the project</p>
        <h2 id="team-heading" className="mt-1 text-lg font-semibold text-text-primary">Caventas Team</h2>
        <p className="mt-1 text-meta text-text-secondary">Asia Pacific University of Technology &amp; Innovation (APU)</p>
        <ul className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {team.map((member) => (
            <li key={member} className="min-w-0 rounded border border-border-subtle bg-canvas px-3 py-3 text-meta text-text-primary">{member}</li>
          ))}
        </ul>
      </section>

      <details className="rounded-md border border-border-subtle bg-surface">
        <summary className="cursor-pointer rounded-md px-5 py-4 text-base font-semibold text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">Credits and licensing</summary>
        <div className="space-y-5 border-t border-border-subtle p-5">
          <section aria-labelledby="icon-credits-heading">
            <h2 id="icon-credits-heading" className="text-base font-semibold text-text-primary">Icons</h2>
            <div className="mt-2 space-y-2 text-base text-text-secondary">
              <p>
                Icons: CoreUI Icons Free by the CoreUI Team — licensed under CC BY
                4.0.
              </p>
              <ul className="list-disc space-y-1 pl-5 text-meta">
                <li>
                  <a
                    className="text-status-info hover:underline"
                    href="https://github.com/coreui/coreui-icons"
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    github.com/coreui/coreui-icons
                  </a>
                </li>
                <li>
                  <a
                    className="text-status-info hover:underline"
                    href="https://creativecommons.org/licenses/by/4.0/"
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    creativecommons.org/licenses/by/4.0/
                  </a>
                </li>
              </ul>
              <p className="text-meta text-text-muted">
                Only the free linear <span className="mono">cil-*</span> icon family is
                used. The <span className="mono">@coreui/icons</span> package code is
                MIT-licensed; the SVG icon artwork itself is CC BY 4.0, which this
                attribution covers.
              </p>
            </div>
          </section>

          <section aria-labelledby="typography-heading">
            <h2 id="typography-heading" className="text-base font-semibold text-text-primary">Typography</h2>
            <p className="mt-2 text-base text-text-secondary">
              Barlow for interface text; IBM Plex Mono for technical identifiers.
              Both are self-hosted via Fontsource (SIL Open Font License).
            </p>
          </section>
        </div>
      </details>
    </div>
  );
}

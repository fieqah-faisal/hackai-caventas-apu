import { useDocumentTitle } from "@/lib/useDocumentTitle";

export function AboutPage() {
  useDocumentTitle("About & credits");
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <p className="mono text-eyebrow uppercase text-text-muted">About</p>
        <h1 className="mt-1 text-title font-bold text-text-primary">Caventas</h1>
        <p className="mt-2 text-base text-text-secondary">
          Human-in-the-loop incident-response planning workspace. The system
          recommends; analysts decide; all execution is simulated.
        </p>
      </div>

      <section className="rounded-md border border-border-subtle bg-surface p-5">
        <h2 className="text-lg font-semibold text-text-primary">Credits & licensing</h2>
        <div className="mt-3 space-y-2 text-base text-text-secondary">
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

      <section className="rounded-md border border-border-subtle bg-surface p-5">
        <h2 className="text-lg font-semibold text-text-primary">Typography</h2>
        <p className="mt-2 text-base text-text-secondary">
          Barlow for interface text; IBM Plex Mono for technical identifiers.
          Both are self-hosted via Fontsource (SIL Open Font License).
        </p>
      </section>
    </div>
  );
}
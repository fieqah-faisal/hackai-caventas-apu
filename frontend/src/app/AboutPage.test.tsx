import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AboutPage } from "./AboutPage";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";

function renderAboutRoute() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <header><TopBar onOpenMenu={() => {}} pendingApprovals={null} /></header>
      <Sidebar />
      <Routes>
        <Route path="/" element={<main><p>Workspace</p></main>} />
        <Route path="/about" element={<main><AboutPage /></main>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Caventas branding and About page", () => {
  it("uses the supplied logo, shows current organization and analyst identities, and navigates to About", async () => {
    const user = userEvent.setup();
    renderAboutRoute();

    const headerBrand = screen.getByRole("img", { name: "Caventas" });
    expect(headerBrand).toHaveAttribute("src", expect.stringContaining("Caventas-logo.png"));
    expect(screen.getByRole("img", { name: "Caventas logo" })).toHaveAttribute("src", expect.stringContaining("Caventas-logo.png"));
    expect(screen.getByRole("button", { name: "Caventas SOC Analyst profile" })).toHaveAttribute("title", "Caventas SOC Analyst");
    expect(screen.getByText("Caventas SOC")).toBeInTheDocument();
    expect(screen.queryByText(/Caventas Demo Org|Demo Org|Demo Analyst|Fieqah A\./)).not.toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "About & credits" }));
    expect(await screen.findByRole("heading", { name: "Caventas", level: 1 })).toBeInTheDocument();
    expect(document.title).toBe("About | Caventas");
  });

  it("presents the product, implemented capabilities, safety statement, team, and preserved credits", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><AboutPage /></MemoryRouter>);

    expect(screen.getByText("Agentic incident-response planning with human control.")).toBeInTheDocument();
    expect(screen.getByText("Caventas is a human-in-the-loop incident-response workspace designed to help Tier 1 and junior Tier 2 SOC analysts turn fragmented security evidence into an understandable, evidence-backed investigation.")).toBeInTheDocument();
    expect(screen.getByText("It reconstructs an evolving incident state, connects related entities and activity, recommends bounded response actions, and keeps analysts in control through explicit review and approval. All prototype actions are simulated, traceable and bound to the incident-state version used to produce the plan.")).toBeInTheDocument();

    for (const heading of ["Evidence intake", "Incident reconstruction", "Agent-assisted analysis", "Human-controlled response", "Continuous replanning", "Structured reporting"]) {
      expect(screen.getByRole("heading", { name: heading, level: 3 })).toBeInTheDocument();
    }
    expect(screen.getByRole("heading", { name: "What Caventas does" }).closest("section")?.querySelector(".grid")).toHaveClass("sm:grid-cols-2", "xl:grid-cols-3");
    expect(screen.getByText("Caventas is a defensive prototype. It uses synthetic incident data and bounded simulated actions. Agent output is advisory and does not replace analyst judgement or authorization.")).toBeInTheDocument();
    expect(screen.getByText("Asia Pacific University of Technology & Innovation (APU)")).toBeInTheDocument();
    expect(screen.getAllByRole("list")[0]).toHaveClass("sm:grid-cols-2", "lg:grid-cols-3");
    for (const member of [
      "Syafieqah Binti Ahmad Shukri",
      "Aida Batrisya Binti Ramlee",
      "Al-Aidan Iszdehar Farrn Bin Ismail Faizal",
      "Airil Hakimi bin Anuar",
      "Raajshreedhar Sathia Murthy",
    ]) {
      expect(screen.getByText(member)).toBeInTheDocument();
    }

    await user.click(screen.getByText("Credits and licensing"));
    expect(screen.getByText(/CoreUI Icons Free by the CoreUI Team/)).toBeInTheDocument();
    expect(screen.getAllByText(/CC BY 4\.0/)).toHaveLength(2);
    expect(screen.getByText(/Barlow for interface text; IBM Plex Mono for technical identifiers/)).toBeInTheDocument();
    expect(screen.getByText(/SIL Open Font License/)).toBeInTheDocument();
  });
});

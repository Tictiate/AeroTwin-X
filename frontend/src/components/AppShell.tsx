import { NavLink, Outlet } from "react-router-dom";
import { useAppData } from "../context/AppDataContext";
import { IconDiagnostics, IconHistory, IconMission, IconOverview, IconReliability, IconTwin } from "./icons";

const NAV = [
  { to: "/", label: "Overview", icon: IconOverview, end: true },
  { to: "/twin", label: "Digital Twin", icon: IconTwin },
  { to: "/diagnostics", label: "Diagnostics", icon: IconDiagnostics },
  { to: "/reliability", label: "Reliability", icon: IconReliability },
  { to: "/mission", label: "Mission", icon: IconMission },
  { to: "/history", label: "History", icon: IconHistory },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
        >
          <Icon />
          {label}
        </NavLink>
      ))}
    </>
  );
}

export function AppShell() {
  const { effectiveTelemetry, stream } = useAppData();
  const wsOpen = stream.status === "open";

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="sidebar-brand">
          <div className="name">AEROTWIN&#8209;X</div>
          <div className="tagline">Propulsion Digital Twin</div>
        </div>
        <nav className="sidebar-nav">
          <NavLinks />
        </nav>
        <div className="sidebar-footer">
          <div className="row">
            <span>Engine</span>
            <b>{effectiveTelemetry?.engineId ?? "—"}</b>
          </div>
          <div className="row">
            <span>Mission</span>
            <b>{effectiveTelemetry?.missionId ?? "—"}</b>
          </div>
          <div className="row" style={{ marginTop: 6 }}>
            <span className={`live-dot ${wsOpen ? "open" : "down"}`}>
              <span className="dot" aria-hidden="true" />
              {wsOpen ? "LIVE" : stream.status.toUpperCase()}
            </span>
          </div>
        </div>
      </aside>

      <div className="topbar" role="banner">
        <span className="topbar-brand">AEROTWIN&#8209;X</span>
        <span className={`live-dot ${wsOpen ? "open" : "down"}`}>
          <span className="dot" aria-hidden="true" />
          {wsOpen ? "LIVE" : stream.status.toUpperCase()}
        </span>
      </div>
      <nav className="topbar-nav" aria-label="Primary navigation">
        <NavLinks />
      </nav>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}

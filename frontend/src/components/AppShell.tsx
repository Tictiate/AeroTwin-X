import { Outlet } from "react-router-dom";
import { useAppData } from "../context/AppDataContext";
import { IconClose, IconDiagnostics, IconHistory, IconMenu, IconMission, IconOverview, IconReliability, IconTwin } from "./icons";
import { DesktopSidebar, MobilePanel, MobileTopBar, SidebarLink, SidebarProvider, useSidebar, type SidebarNavItem } from "./ui/sidebar";
import { ScrollProgress } from "./ui/scroll-progress";

const NAV: SidebarNavItem[] = [
  { to: "/", label: "Overview", icon: <IconOverview />, end: true },
  { to: "/twin", label: "Digital Twin", icon: <IconTwin /> },
  { to: "/diagnostics", label: "Diagnostics", icon: <IconDiagnostics /> },
  { to: "/reliability", label: "Reliability", icon: <IconReliability /> },
  { to: "/mission", label: "Mission", icon: <IconMission /> },
  { to: "/history", label: "History", icon: <IconHistory /> },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      {NAV.map((item) => (
        <SidebarLink key={item.to} link={item} onNavigate={onNavigate} />
      ))}
    </>
  );
}

function Brand() {
  return (
    <div className="aero-sidebar-brand">
      <div className="aero-sidebar-brand-mark" aria-hidden="true">
        AX
      </div>
      <div className="aero-sidebar-brand-text">
        <div className="name">AEROTWIN&#8209;X</div>
        <div className="tagline">Propulsion Digital Twin</div>
      </div>
    </div>
  );
}

function Footer({ engineId, missionId, wsOpen, statusLabel }: { engineId: string; missionId: string; wsOpen: boolean; statusLabel: string }) {
  return (
    <div className="aero-sidebar-footer">
      <div className="row">
        <span>Engine</span>
        <b>{engineId}</b>
      </div>
      <div className="row">
        <span>Mission</span>
        <b>{missionId}</b>
      </div>
      <div className="row" style={{ marginTop: 6 }}>
        <span className={`live-dot ${wsOpen ? "open" : "down"}`}>
          <span className="dot" aria-hidden="true" />
          {statusLabel}
        </span>
      </div>
    </div>
  );
}

function AppShellInner() {
  const { effectiveTelemetry, stream } = useAppData();
  const { open, setOpen } = useSidebar();
  const wsOpen = stream.status === "open";
  const engineId = effectiveTelemetry?.engineId ?? "—";
  const missionId = effectiveTelemetry?.missionId ?? "—";
  const statusLabel = wsOpen ? "LIVE" : stream.status.toUpperCase();

  return (
    <div className="shell">
      <DesktopSidebar>
        <Brand />
        <nav className="aero-sidebar-nav">
          <NavLinks />
        </nav>
        <Footer engineId={engineId} missionId={missionId} wsOpen={wsOpen} statusLabel={statusLabel} />
      </DesktopSidebar>

      <MobileTopBar
        open={open}
        onOpen={() => setOpen(!open)}
        menuIcon={<IconMenu />}
        closeIcon={<IconClose />}
        brand={<span className="aero-mobile-brand-text">AEROTWIN&#8209;X</span>}
      />
      <MobilePanel closeIcon={<IconClose />}>
        <Brand />
        <nav className="aero-sidebar-nav">
          <NavLinks onNavigate={() => setOpen(false)} />
        </nav>
        <Footer engineId={engineId} missionId={missionId} wsOpen={wsOpen} statusLabel={statusLabel} />
      </MobilePanel>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}

export function AppShell() {
  return (
    <>
      <ScrollProgress />
      <SidebarProvider>
        <AppShellInner />
      </SidebarProvider>
    </>
  );
}

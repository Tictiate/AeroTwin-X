import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";

/**
 * Adapted from the well-known Aceternity UI animated-sidebar interaction
 * pattern (SidebarProvider / DesktopSidebar / MobileSidebar / SidebarLink,
 * hover-to-expand via framer-motion). The demo's Next.js Link, Tailwind
 * utility styling, and generic dashboard content are NOT carried over --
 * only the interaction architecture is reused. Everything visual is driven
 * by AeroTwin-X's existing CSS design tokens, and navigation goes through
 * react-router-dom's NavLink so active-state and routing stay exactly as
 * they were.
 *
 * Desktop expansion is an OVERLAY (fixed position, animated width) rather
 * than a layout reflow: the main content area's margin is always sized to
 * the COLLAPSED width, so hovering the sidebar never resizes anything else
 * on the page -- in particular, it never touches the Digital Twin's WebGL
 * canvas, which only ever needs to be laid out once.
 */

const COLLAPSED_WIDTH = 64;
const EXPANDED_WIDTH = 232;

export interface SidebarNavItem {
  to: string;
  label: string;
  end?: boolean;
  icon: ReactNode;
}

interface SidebarContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  animate: boolean;
}

const SidebarContext = createContext<SidebarContextValue | undefined>(undefined);

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within a SidebarProvider");
  return ctx;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  return <SidebarContext.Provider value={{ open, setOpen, animate: !reducedMotion }}>{children}</SidebarContext.Provider>;
}

export function DesktopSidebar({ children }: { children: ReactNode }) {
  const { open, setOpen, animate } = useSidebar();
  return (
    <motion.aside
      className={`aero-sidebar${open ? " expanded" : ""}`}
      initial={false}
      animate={{ width: open ? EXPANDED_WIDTH : COLLAPSED_WIDTH }}
      transition={animate ? { duration: 0.28, ease: [0.4, 0, 0.2, 1] } : { duration: 0 }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
      aria-label="Primary navigation"
    >
      {children}
    </motion.aside>
  );
}

export function MobileTopBar({
  brand,
  onOpen,
  open,
  menuIcon,
  closeIcon,
}: {
  brand: ReactNode;
  onOpen: () => void;
  open: boolean;
  menuIcon: ReactNode;
  closeIcon: ReactNode;
}) {
  return (
    <div className="aero-mobile-bar" role="banner">
      <div className="aero-mobile-bar-brand">{brand}</div>
      <button
        type="button"
        className="aero-mobile-menu-btn"
        aria-label={open ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={open}
        onClick={onOpen}
      >
        {open ? closeIcon : menuIcon}
      </button>
    </div>
  );
}

export function MobilePanel({ children, closeIcon }: { children: ReactNode; closeIcon: ReactNode }) {
  const { open, setOpen, animate } = useSidebar();

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="aero-mobile-panel"
          initial={animate ? { x: "-100%", opacity: 0 } : { opacity: 1 }}
          animate={{ x: 0, opacity: 1 }}
          exit={animate ? { x: "-100%", opacity: 0 } : { opacity: 0 }}
          transition={animate ? { duration: 0.3, ease: "easeInOut" } : { duration: 0 }}
          role="dialog"
          aria-modal="true"
          aria-label="Primary navigation"
        >
          <button type="button" className="aero-mobile-close" aria-label="Close navigation menu" onClick={() => setOpen(false)}>
            {closeIcon}
          </button>
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function SidebarLink({ link, onNavigate }: { link: SidebarNavItem; onNavigate?: () => void }) {
  return (
    <NavLink
      to={link.to}
      end={link.end}
      onClick={onNavigate}
      className={({ isActive }) => `aero-sidebar-link${isActive ? " active" : ""}`}
    >
      <span className="aero-sidebar-link-icon">{link.icon}</span>
      <span className="aero-sidebar-link-label">{link.label}</span>
    </NavLink>
  );
}

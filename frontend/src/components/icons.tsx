/** Minimal hand-drawn line icons, 20x20 viewBox, stroke-based -- no icon library dependency. */
type IconProps = { className?: string };

const base = { fill: "none", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export function IconOverview({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} {...base}>
      <rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1" />
      <rect x="11" y="2.5" width="6.5" height="4" rx="1" />
      <rect x="11" y="8.5" width="6.5" height="4" rx="1" />
      <rect x="2.5" y="11" width="6.5" height="6.5" rx="1" />
      <rect x="11" y="14.5" width="6.5" height="3" rx="1" />
    </svg>
  );
}

export function IconTwin({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} {...base}>
      <circle cx="10" cy="10" r="2.2" />
      <path d="M10 2.5v3.2M10 14.3v3.2M2.5 10h3.2M14.3 10h3.2M4.8 4.8l2.3 2.3M12.9 12.9l2.3 2.3M15.2 4.8l-2.3 2.3M7.1 12.9l-2.3 2.3" />
    </svg>
  );
}

export function IconDiagnostics({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} {...base}>
      <path d="M2.5 11.5h3l1.6-4.5 2.4 8 1.8-6 1.3 2.5h3.9" />
    </svg>
  );
}

export function IconReliability({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} {...base}>
      <path d="M10 2.5 3 5.5v4.3c0 4 3 6.7 7 7.7 4-1 7-3.7 7-7.7V5.5L10 2.5Z" />
      <path d="M7 10.2l2 2 4.2-4.2" />
    </svg>
  );
}

export function IconMission({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} {...base}>
      <path d="M10 2.5c2.5 2.6 2.5 12.4 0 15M10 2.5c-2.5 2.6-2.5 12.4 0 15" />
      <ellipse cx="10" cy="10" rx="7.5" ry="3.2" />
      <ellipse cx="10" cy="10" rx="7.5" ry="7.5" />
    </svg>
  );
}

export function IconHistory({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} {...base}>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 5.5V10l3 2" />
    </svg>
  );
}

export function IconChevron({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} {...base}>
      <path d="M7.5 4.5 13 10l-5.5 5.5" />
    </svg>
  );
}

import { humanize, statusTier } from "../lib/status";

export function StatusPill({ value, label }: { value: string | null | undefined; label?: string }) {
  const tier = statusTier(value);
  return (
    <span className="status-tag" data-tier={tier}>
      <span>{label ?? humanize(value)}</span>
    </span>
  );
}

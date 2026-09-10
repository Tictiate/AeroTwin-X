import { humanize, statusTier } from "../lib/status";

export function StatusPill({ value, label }: { value: string | null | undefined; label?: string }) {
  const tier = statusTier(value);
  return <span className={`pill status-${tier}`}>{label ?? humanize(value)}</span>;
}

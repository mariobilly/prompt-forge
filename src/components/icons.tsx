// Minimal stroke icons (lucide-style) so the UI doesn't depend on emoji.
type P = { className?: string };
const base = { fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, viewBox: "0 0 24 24" };

export const CopyIcon = ({ className = "h-3.5 w-3.5" }: P) => (
  <svg {...base} className={className}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></svg>
);
export const CheckIcon = ({ className = "h-3.5 w-3.5" }: P) => (
  <svg {...base} className={className}><path d="M20 6 9 17l-5-5" /></svg>
);
export const SparkIcon = ({ className = "h-3.5 w-3.5" }: P) => (
  <svg {...base} className={className}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.1 2.1M15.6 15.6l2.1 2.1M6.3 17.7l2.1-2.1M15.6 8.4l2.1-2.1" /></svg>
);
export const HammerIcon = ({ className = "h-3.5 w-3.5" }: P) => (
  <svg {...base} className={className}><path d="m15 12-8.4 8.4a2.1 2.1 0 0 1-3-3L12 9" /><path d="M17.6 15 22 10.6M20.9 11.7l-2.4-2.4a1.8 1.8 0 0 1-.5-1.3V6.8l-2.3-2.3A5.8 5.8 0 0 0 11.6 2.8H9l.9.8a6.2 6.2 0 0 1 2.1 4.6v1.6l2 2h1.2a1.8 1.8 0 0 1 1.3.5l2.4 2.4" /></svg>
);
export const XIcon = ({ className = "h-3.5 w-3.5" }: P) => (
  <svg {...base} className={className}><path d="M18 6 6 18M6 6l12 12" /></svg>
);
export const ChevronIcon = ({ className = "h-3.5 w-3.5" }: P) => (
  <svg {...base} className={className}><path d="m6 9 6 6 6-6" /></svg>
);
export const SearchIcon = ({ className = "h-3.5 w-3.5" }: P) => (
  <svg {...base} className={className}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
);
export const StarIcon = ({ className = "h-3.5 w-3.5", filled = false }: P & { filled?: boolean }) => (
  <svg {...base} fill={filled ? "currentColor" : "none"} className={className}><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z" /></svg>
);
export const RefreshIcon = ({ className = "h-3.5 w-3.5" }: P) => (
  <svg {...base} className={className}><path d="M21 12a9 9 0 1 1-2.6-6.4L21 8" /><path d="M21 3v5h-5" /></svg>
);

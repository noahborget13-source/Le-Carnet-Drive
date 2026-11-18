// Logo de Le Carnet : petit carnet à marge rouge (identique à celui de l'application)
export default function NotebookMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="2" width="18" height="20" rx="2.5" fill="var(--accent)" opacity="0.14" />
      <rect x="3" y="2" width="18" height="20" rx="2.5" stroke="var(--accent)" strokeWidth="1.5" />
      <line x1="9.5" y1="2.5" x2="9.5" y2="21.5" stroke="#E5484D" strokeWidth="1.2" />
      <line x1="12" y1="7" x2="18" y2="7" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="12" y1="11" x2="18" y2="11" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="12" y1="15" x2="16" y2="15" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

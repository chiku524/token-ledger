export function BrandMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#2140E6" />
      <rect x="7" y="8" width="10" height="3.2" rx="1" fill="#C8F542" />
      <rect x="7" y="14.4" width="18" height="3.2" rx="1" fill="#F7F8FC" />
      <rect x="7" y="20.8" width="14" height="3.2" rx="1" fill="#F7F8FC" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <BrandMark />
      <span className="font-display text-base font-bold tracking-tight whitespace-nowrap">Token Ledger</span>
    </span>
  );
}

// lucide has no butterfly, so this one is drawn to match its 24px outline style.
export function ButterflyIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 7v13" />
      <path d="M12 7C10 3 6 2 4 4c-2 2 0 6 3 8-3 1-4 4-2 6s5 1 7-3" />
      <path d="M12 7c2-4 6-5 8-3 2 2 0 6-3 8 3 1 4 4 2 6s-5 1-7-3" />
      <path d="M10.5 4.5 9 2.5M13.5 4.5 15 2.5" />
    </svg>
  );
}

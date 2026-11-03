// BrandIcon — inline copy of the app's canonical brand mark
// (frontend/public/favicon.svg, also rendered by BrandMark.jsx in the app
// header). Fixed hexes mirror that file exactly so the ad-site carries the
// same identity: green hub core, agent/human/stage satellite lanes, orbit
// ring, dark tile.
export function BrandIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 128 128" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="kb-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a1919" />
          <stop offset="1" stopColor="#0b0b0b" />
        </linearGradient>
        <radialGradient id="kb-core" cx="0.35" cy="0.3" r="0.9">
          <stop offset="0" stopColor="#8ef29b" />
          <stop offset="0.55" stopColor="#7bdb85" />
          <stop offset="1" stopColor="#43a354" />
        </radialGradient>
        <linearGradient id="kb-tileEdge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2e3a2f" />
          <stop offset="1" stopColor="#141414" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="126" height="126" rx="27" fill="url(#kb-bg)" />
      <rect
        x="1"
        y="1"
        width="126"
        height="126"
        rx="27"
        fill="none"
        stroke="url(#kb-tileEdge)"
        strokeWidth="2"
      />
      <g transform="rotate(-90 64 64)">
        <circle
          cx="64"
          cy="64"
          r="40"
          fill="none"
          stroke="#3f4a42"
          strokeWidth="3"
        />
        <circle
          cx="64"
          cy="64"
          r="40"
          fill="none"
          stroke="#7bdb85"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="56 195.33"
          opacity="0.9"
        />
      </g>
      <g stroke="#4a5a4a" strokeWidth="2" strokeLinecap="round">
        <line x1="64" y1="64" x2="64" y2="24" />
        <line x1="64" y1="64" x2="98.64" y2="44" />
        <line x1="64" y1="64" x2="29.36" y2="44" />
      </g>
      <circle cx="64" cy="64" r="24" fill="url(#kb-core)" />
      <circle
        cx="64"
        cy="64"
        r="24"
        fill="none"
        stroke="#00320e"
        strokeOpacity="0.55"
        strokeWidth="2.5"
      />
      <circle cx="56" cy="56" r="6" fill="#ffffff" fillOpacity="0.28" />
      <circle cx="64" cy="24" r="8" fill="#9acbff" />
      <circle cx="98.64" cy="44" r="8" fill="#ffb77f" />
      <circle cx="29.36" cy="44" r="8" fill="#ffb74d" />
    </svg>
  )
}

/***
 * MARK: BrandMark
 * @description KainBain's orchestration-core brand mark — a bright green hub
 * node with three colored satellite lanes on an orbit ring, mirroring the app's
 * SVG favicon (favicon.svg). Reusable across the header, empty states, and
 * loading surfaces so the app's identity is consistent everywhere.
 *
 * The three satellite nodes use the app's accent palette:
 *   - blue  #9acbff (secondary)  — agent lane
 *   - peach #ffb77f (tertiary)   — human review lane
 *   - amber #ffb74d (ochre)      — stage / tooling lane
 *
 * @example <BrandMark className="w-8 h-8" />
 * @param {string} [className] - Tailwind sizing/positioning classes. The SVG is
 *   square and scales from its viewBox, so w/h classes control the size.
 * @param {boolean} [tile=false] - Render the dark rounded tile background (the
 *   full favicon look) instead of a transparent mark that sits on an existing
 *   dark surface.
 ***/
export function BrandMark({ className = 'w-8 h-8', tile = false }) {
  return (
    <svg viewBox="0 0 128 128" className={className} aria-hidden="true" focusable="false">
      {tile && (
        <>
          <rect x="1" y="1" width="126" height="126" rx="27" fill="#141414" />
          <rect
            x="1"
            y="1"
            width="126"
            height="126"
            rx="27"
            fill="none"
            stroke="#2e3a2f"
            strokeWidth="2"
          />
        </>
      )}

      {/* Orbit ring + progress arc (the "live flow" gauge) */}
      <g transform="rotate(-90 64 64)">
        <circle cx="64" cy="64" r="40" fill="none" stroke="#3f4a42" strokeWidth="3" />
        <circle
          cx="64"
          cy="64"
          r="40"
          fill="none"
          stroke="var(--accent-hex, #7bdb85)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="56 195.33"
        />
      </g>

      {/* Connector lines from the core to the satellite lanes */}
      <g stroke="#4a5a4a" strokeWidth="2" strokeLinecap="round">
        <line x1="64" y1="64" x2="64" y2="24" />
        <line x1="64" y1="64" x2="98.64" y2="44" />
        <line x1="64" y1="64" x2="29.36" y2="44" />
      </g>

      {/* Central orchestration core */}
      <circle cx="64" cy="64" r="24" fill="var(--accent-hex, #7bdb85)" />
      <circle
        cx="64"
        cy="64"
        r="24"
        fill="none"
        stroke="#00531c"
        strokeOpacity="0.55"
        strokeWidth="2.5"
      />
      <circle cx="56" cy="56" r="6" fill="#ffffff" opacity="0.3" />

      {/* Satellite stage nodes */}
      <circle cx="64" cy="24" r="8" fill="#9acbff" />
      <circle cx="98.64" cy="44" r="8" fill="#ffb77f" />
      <circle cx="29.36" cy="44" r="8" fill="#ffb74d" />
    </svg>
  );
}

// SIXgnals brand logo — recreated as a transparent inline SVG so it sits on
// any background with no white box. The radar/constellation mark echoes the
// app's Trust Constellation view.
export default function Logo({ height = 30, word = true }) {
  return (
    <span className="brand-logo" style={{ '--logo-h': `${height}px` }}>
      <svg className="brand-mark" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="sixSweep" x1="20" y1="20" x2="35.5" y2="6.5" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#E0231A" stopOpacity="0.15" />
            <stop offset="1" stopColor="#E0231A" />
          </linearGradient>
        </defs>
        {/* concentric rings */}
        <circle cx="20" cy="20" r="7"  stroke="#d8d8de" strokeWidth="1" />
        <circle cx="20" cy="20" r="12" stroke="#dcdce1" strokeWidth="1" />
        <circle cx="20" cy="20" r="17" stroke="#e3e3e7" strokeWidth="1" />
        {/* sweep line */}
        <line x1="20" y1="20" x2="35.5" y2="6.5" stroke="url(#sixSweep)" strokeWidth="2.4" strokeLinecap="round" />
        {/* nodes */}
        <circle cx="35.5" cy="6.5" r="2.3" fill="#16203a" />
        <circle cx="8.6"  cy="14.5" r="1.7" fill="#b8b8c0" />
        <circle cx="27"   cy="34.5" r="1.6" fill="#c4c4c8" />
        {/* center pulse */}
        <circle cx="20" cy="20" r="3.1" fill="#E0231A" />
      </svg>
      {word && (
        <span className="brand-word">
          <span className="bw-six">SIX</span><span className="bw-rest">gnals</span>
        </span>
      )}
    </span>
  )
}

export default function ThemeToggle({ theme, onToggle, compact = false }) {
  const isLight = theme === 'light'

  return (
    <button
      type="button"
      className={`theme-toggle${compact ? ' compact' : ''}`}
      onClick={onToggle}
      aria-pressed={isLight}
      aria-label={`Switch to ${isLight ? 'dark' : 'light'} theme`}
      title={`Switch to ${isLight ? 'dark' : 'light'} theme`}
    >
      <span className="theme-toggle-track" aria-hidden="true">
        <span className="theme-toggle-thumb" />
      </span>
      {!compact && <span className="theme-toggle-label">{isLight ? 'Light' : 'Dark'}</span>}
    </button>
  )
}

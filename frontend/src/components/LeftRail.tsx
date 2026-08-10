interface Props {
  devMode: boolean;
  onToggleDevMode: () => void;
}

export default function LeftRail({ devMode, onToggleDevMode }: Props) {
  return (
    <aside className="left-rail" aria-label="Main Navigation">
      <div className="rail-top">
        <div className="brand-icon" title="Lexora Reader">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            <path d="M12 6v6" />
            <path d="M9 9h6" />
          </svg>
        </div>

        <nav className="rail-nav">
          <button
            type="button"
            className="rail-item active"
            aria-label="Reader Studio"
            title="Reader Studio"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
            <span className="rail-item-label">Studio</span>
          </button>
        </nav>
      </div>

      {import.meta.env.DEV && <div className="rail-bottom">
        <button
          type="button"
          className={`rail-item dev-mode-toggle ${devMode ? 'active' : ''}`}
          aria-label={devMode ? 'Disable Developer Mode' : 'Enable Developer Mode'}
          title={`Developer Mode (${devMode ? 'ON' : 'OFF'}) — Ctrl+Shift+D`}
          onClick={onToggleDevMode}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m18 16 4-4-4-4" />
            <path d="m6 8-4 4 4 4" />
            <path d="m14.5 4-5 16" />
          </svg>
          <span className="rail-item-label">Dev</span>
        </button>
      </div>}
    </aside>
  );
}

export default function Sidebar({ activePanel, navItems, nextHint, onPanelChange }) {
  return (
    <aside className="sidebar">
      <p className="sidebar-title">Core Workflows</p>

      {navItems.map((item) => (
        <button
          key={item.id}
          className={`nav-btn ${activePanel === item.id ? "active" : ""}`}
          type="button"
          onClick={() => onPanelChange(item.id)}
        >
          {item.label}
        </button>
      ))}

      <div className="next-box">
        <p className="next-title">Next Build Slice</p>
        <p>{nextHint}</p>
      </div>
    </aside>
  );
}
export default function Header({ user, onLogout }) {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">BA</div>
        <div>
          <p className="eyebrow">STLCC Budget Office</p>
          <h1>Budget Assistant Agent</h1>
        </div>
      </div>

      <div className="header-right">
        {user && (
          <div className="user-pill">
            <span>{user.name} | {user.role}</span>
            <button type="button" onClick={onLogout}>Logout</button>
          </div>
        )}
      </div>
    </header>
  );
}
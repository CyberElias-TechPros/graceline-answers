import { Link, Outlet } from 'react-router-dom';

export default function Layout() {
  return (
    <>
      <header className="site">
        <div className="wrap">
          <Link to="/" className="brand">GraceLine Answers</Link>
          <nav>
            <Link to="/ask">Ask</Link>
            <Link to="/archive">Archive</Link>
            <Link to="/prayer">Prayer</Link>
            <Link to="/admin/inbox">Admin</Link>
          </nav>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </>
  );
}

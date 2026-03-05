import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-logo">ContabilAI</div>
        <nav className="sidebar-nav">
          <NavLink to="/" end>
            <span>Dashboard</span>
          </NavLink>
          {(user.role === 'superadmin') && (
            <NavLink to="/offices">
              <span>Escritorios</span>
            </NavLink>
          )}
          <NavLink to="/companies">
            <span>Empresas</span>
          </NavLink>
          <NavLink to="/users">
            <span>Usuarios</span>
          </NavLink>
          <NavLink to="/escalations">
            <span>Escalacoes</span>
          </NavLink>
          {['superadmin', 'office_admin'].includes(user.role) && (
            <NavLink to="/integrations">
              <span>Integracoes</span>
            </NavLink>
          )}
          <a href="#" onClick={handleLogout}>
            <span>Sair</span>
          </a>
        </nav>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}

import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV_SECTIONS = [
  {
    label: 'Geral',
    items: [
      { to: '/', label: 'Dashboard', end: true },
    ],
  },
  {
    label: 'Onboarding',
    roles: ['superadmin', 'office_admin'],
    items: [
      { to: '/offices', label: 'Escritorios', roles: ['superadmin'] },
      { to: '/companies', label: 'Empresas' },
      { to: '/users', label: 'Usuarios' },
    ],
  },
  {
    label: 'Integracoes',
    roles: ['superadmin', 'office_admin'],
    items: [
      { to: '/whatsapp', label: 'WhatsApp' },
      { to: '/erp', label: 'ERP' },
      { to: '/integrations', label: 'OAuth' },
    ],
  },
  {
    label: 'Operacional',
    items: [
      { to: '/financial', label: 'Financeiro' },
      { to: '/tasks', label: 'Tarefas' },
      { to: '/copilot', label: 'Copilot' },
      { to: '/escalations', label: 'Escalacoes' },
    ],
  },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout(e) {
    e.preventDefault();
    logout();
    navigate('/login');
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-logo">ContabilAI</div>
        <nav className="sidebar-nav">
          {NAV_SECTIONS.map((section) => {
            if (section.roles && !section.roles.includes(user.role)) return null;

            const visibleItems = section.items.filter(
              (item) => !item.roles || item.roles.includes(user.role)
            );
            if (visibleItems.length === 0) return null;

            return (
              <div key={section.label}>
                <div className="sidebar-section">{section.label}</div>
                {visibleItems.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.end}>
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            );
          })}
          <div className="sidebar-section" style={{ marginTop: 'auto' }}></div>
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

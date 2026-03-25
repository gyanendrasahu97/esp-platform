import { Link, useLocation } from 'react-router-dom'
import { Code2, Cpu, LayoutDashboard, LogOut, Upload } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'

const navItems = [
  { to: '/',       icon: LayoutDashboard, label: 'Devices' },
  { to: '/editor', icon: Code2,           label: 'Code Editor' },
]

export default function Sidebar() {
  const { pathname } = useLocation()
  const { logout, user } = useAuthStore()

  return (
    <aside className="w-56 bg-slate-900 border-r border-slate-800 flex flex-col h-screen">
      <div className="p-4 border-b border-slate-800 flex items-center gap-2">
        <Cpu className="text-blue-400" size={22} />
        <span className="font-bold text-white text-sm">ESP Platform</span>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <Link
            key={to} to={to}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              pathname === to
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Icon size={16} />
            {label}
          </Link>
        ))}
      </nav>

      <div className="p-3 border-t border-slate-800">
        <div className="text-xs text-slate-500 px-3 mb-2 truncate">{user?.email}</div>
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 w-full transition-colors"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </aside>
  )
}

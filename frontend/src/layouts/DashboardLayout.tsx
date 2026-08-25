import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { NAV, ROLE_LABEL } from "./nav";

export function DashboardLayout() {
  const { user, logout } = useAuth();
  if (!user) return null;
  const items = NAV[user.role];

  return (
    <div className="min-h-screen bg-page">
      {/* Sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-surface md:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <span className="text-2xl">🚐</span>
          <div>
            <p className="text-sm font-extrabold leading-tight text-ink">Transport</p>
            <p className="text-xs text-muted">{ROLE_LABEL[user.role]}</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-2">
          {items.map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              end={i.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? "bg-lime/10 text-lime ring-1 ring-lime/30"
                    : "text-muted hover:bg-elevated hover:text-ink"
                }`
              }
            >
              <span className="text-base">{i.icon}</span>
              {i.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-border p-3">
          <div className="mb-2 px-2">
            <p className="truncate text-sm font-medium text-ink">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
          <button
            onClick={logout}
            className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-muted transition-all duration-150 hover:bg-danger/10 hover:text-danger"
          >
            ⎋ Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-surface px-4 py-3 md:hidden">
        <div className="flex items-center gap-2">
          <span className="text-xl">🚐</span>
          <span className="text-sm font-bold text-ink">{ROLE_LABEL[user.role]}</span>
        </div>
        <button onClick={logout} className="text-sm font-medium text-muted hover:text-danger">
          Sign out
        </button>
      </header>

      {/* Main */}
      <main className="px-4 py-6 pb-24 md:ml-64 md:px-8 md:pb-8">
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-border bg-surface/95 px-1 py-1 backdrop-blur md:hidden">
        {items.map((i) => (
          <NavLink
            key={i.to}
            to={i.to}
            end={i.end}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] font-medium ${
                isActive ? "text-lime" : "text-muted"
              }`
            }
          >
            <span className="text-lg">{i.icon}</span>
            <span className="max-w-full truncate">{i.label.split(" ")[0]}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

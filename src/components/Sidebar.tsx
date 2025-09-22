// src/components/Sidebar.tsx  (parte 1/2)
import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Gauge, Camera, BarChart2, AlertCircle, Cpu } from "lucide-react";

type IconCmp = React.ComponentType<{ className?: string }>;

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

type NavItem = {
  name: string;
  to: string;
  icon: IconCmp;
};

const navItems: NavItem[] = [
  { name: "Dashboard", to: "/", icon: Gauge },
  { name: "Monitoring", to: "/monitoring", icon: Camera },
  { name: "Analytics", to: "/analytics", icon: BarChart2 },
  { name: "Alerts", to: "/alerts", icon: AlertCircle },
  { name: "Simulation", to: "/simulation", icon: Cpu }, // caminho em minúsculo
];

function linkClasses(active: boolean) {
  return [
    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
    active
      ? "bg-accent text-accent-foreground"
      : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
  ].join(" ");
}

function NavList() {
  const { pathname } = useLocation();
  return (
    <nav className="p-3">
      <div className="mb-4 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Menu
      </div>
      <ul className="space-y-1">
        {navItems.map(({ name, to, icon: Icon }) => (
          <li key={to}>
            <NavLink to={to} className={() => linkClasses(pathname === to)}>
              <Icon className="h-4 w-4" />
              <span>{name}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
// src/components/Sidebar.tsx  (parte 2/2)
export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  return (
    <>
      {/* Backdrop (mobile) */}
      <div
        className={[
          "fixed inset-0 z-40 bg-black/40 md:hidden transition-opacity",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        ].join(" ")}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer mobile (fora do fluxo) */}
      <aside
        className={[
          "fixed inset-y-0 left-0 z-50 w-64 border-r bg-background md:hidden",
          "transform transition-transform duration-200 ease-out",
          isOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
        role="dialog"
        aria-modal="true"
      >
        <div className="h-full overflow-y-auto">
          <NavList />
        </div>
      </aside>

      {/* ✅ Sidebar fixa no desktop, SEM wrapper em fluxo */}
      <aside className="hidden md:block fixed left-0 top-16 bottom-0 w-64 border-r bg-background z-40">
        {/* Se o Header tiver outra altura, ajuste top-16 (ex.: top-14/top-20) */}
        <div className="h-full overflow-y-auto">
          <NavList />
        </div>
      </aside>
    </>
  );
}

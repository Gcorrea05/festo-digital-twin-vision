import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Gauge, AlertCircle, BarChart2, Camera, ChevronLeft, Cpu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  requiredRole?: 'viewer' | 'operator' | 'administrator';
  active?: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { hasPermission } = useAuth();
  const { pathname } = useLocation();

  const navItems: NavItem[] = [
    { name: 'Dashboard', href: '/', icon: Gauge, active: pathname === '/' },
    { name: 'Monitoring', href: '/monitoring', icon: Camera, active: pathname === '/monitoring' },
    { name: 'Analytics', href: '/analytics', icon: BarChart2, active: pathname === '/analytics' },
    { name: 'Alerts', href: '/alerts', icon: AlertCircle, active: pathname === '/alerts' },
    { name: 'Simulation', href: '/Simulation', icon: Cpu, active: pathname === '/Simulation' }, // 🔥 Novo item
  ];

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] lg:hidden" onClick={onClose} />
      )}

      <aside
        className={cn(
          'fixed left-0 top-16 z-40 w-64 h-[calc(100vh-64px)]',
          'flex flex-col min-h-0',
          'bg-sidebar/90 dark:bg-sidebar/85 backdrop-blur-md',
          'text-sidebar-foreground border-r border-sidebar-border',
          'transform transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
        aria-label="Primary"
      >
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">IoTech Digitwin</h2>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden text-sidebar-foreground hover:bg-sidebar-accent"
              onClick={onClose}
              aria-label="Close sidebar"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </div>
          <Separator className="mt-3 bg-sidebar-border" />
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto px-2 py-2">
          <ul className="space-y-1">
            {navItems.map((item) => {
              if (item.requiredRole && !hasPermission(item.requiredRole)) return null;
              return (
                <li key={item.name}>
                  <Link to={item.href} onClick={onClose}>
                    <Button
                      variant="ghost"
                      className={cn(
                        'w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                        item.active && 'bg-sidebar-accent text-sidebar-accent-foreground'
                      )}
                    >
                      <item.icon className="mr-2 h-5 w-5" />
                      <span className="truncate">{item.name}</span>
                    </Button>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
    </>
  );
};

export default Sidebar;

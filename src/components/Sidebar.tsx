import React from 'react';
import { Link } from 'react-router-dom';
import { Gauge, AlertCircle, BarChart2, Camera, ChevronLeft } from 'lucide-react';
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
  const currentPath = window.location.pathname;
  
  const navItems: NavItem[] = [
    { 
      name: 'Dashboard', 
      href: '/', 
      icon: Gauge,
      active: currentPath === '/'
    },
    { 
      name: 'Monitoring', 
      href: '/monitoring', 
      icon: Camera,
      active: currentPath === '/monitoring'
    },
    { 
      name: 'Analytics', 
      href: '/analytics', 
      icon: BarChart2,
      active: currentPath === '/analytics'
    },
    { 
      name: 'Alerts', 
      href: '/alerts', 
      icon: AlertCircle,
      active: currentPath === '/alerts'
    }
  ];

  return (
    <aside 
      className={cn(
        'fixed top-0 left-0 z-50 h-full w-64 bg-sidebar text-sidebar-foreground flex flex-col transition-transform transform duration-300 ease-in-out',
        isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      )}
    >
      <div className="flex items-center justify-between p-4">
        <h2 className="text-lg font-bold">FESTO Control</h2>
        <Button 
          variant="ghost" 
          size="icon" 
          className="md:hidden text-sidebar-foreground hover:bg-sidebar-accent" 
          onClick={onClose}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
      </div>
      
      <Separator className="bg-sidebar-border" />
      
      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-1 px-2">
          {navItems.map((item) => {
            // Skip items the user doesn't have permission for
            if (item.requiredRole && !hasPermission(item.requiredRole)) {
              return null;
            }
            
            return (
              <li key={item.name}>
                <Link to={item.href}>
                  <Button
                    variant="ghost"
                    className={cn(
                      'w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                      item.active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : ''
                    )}
                  >
                    <item.icon className="mr-2 h-5 w-5" />
                    {item.name}
                  </Button>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      
      <div className="p-4 text-xs text-sidebar-foreground/70">
        <div className="flex items-center space-x-2 mb-1">
          <div className="status-indicator-active">
            <span></span>
            <span></span>
          </div>
          <span>System Online</span>
        </div>
        <p>FESTO Digital Twin v1.0.0</p>
        <p>© 2025 FESTO Corporation</p>
      </div>
    </aside>
  );
};

export default Sidebar;

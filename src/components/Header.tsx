import React from 'react';
import { BellIcon, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/components/ui/use-toast';
import DarkModeToggle from './DarkModeToggle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface HeaderProps {
  toggleSidebar: () => void;
}

const Header: React.FC<HeaderProps> = ({ toggleSidebar }) => {
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    toast({
      title: 'Logout Successful',
      description: 'You have been logged out of your account.',
    });
  };

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      {/* altura real 64px */}
      <div className="h-16 w-full px-4 flex items-center justify-between">
        <div className="flex items-center min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="mr-2 lg:hidden"
            onClick={toggleSidebar}
            aria-label="Open sidebar"
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* === Logo (imagem) + texto === */}
          <div className="flex items-center shrink-0">
            <img
              src="/CFPreto.png"
              alt="Logomarca"
              className="h-8 w-auto object-contain mr-2 select-none"
              loading="eager"
              decoding="async"
            />
            <h1 className="font-bold text-xl text-slate-800 dark:text-slate-100 whitespace-nowrap">
              IoTech Digitwin
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <DarkModeToggle />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="relative" aria-label="Open notifications">
                <BellIcon className="h-5 w-5" />
                <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel>Notifications</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <div className="max-h-80 overflow-y-auto">
                <DropdownMenuItem className="flex flex-col items-start">
                  <span className="font-medium">Temperature Alert</span>
                  <span className="text-sm text-muted-foreground">Temperature sensor reading above threshold</span>
                  <span className="text-xs text-muted-foreground">10 minutes ago</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="flex flex-col items-start">
                  <span className="font-medium">System Update</span>
                  <span className="text-sm text-muted-foreground">New system update available</span>
                  <span className="text-xs text-muted-foreground">1 hour ago</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="flex flex-col items-start">
                  <span className="font-medium">Maintenance Required</span>
                  <span className="text-sm text-muted-foreground">Main conveyor requires scheduled maintenance</span>
                  <span className="text-xs text-muted-foreground">2 hours ago</span>
                </DropdownMenuItem>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="justify-center text-primary">View all notifications</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative p-0 h-8 w-8 rounded-full" aria-label="Open profile menu">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user?.avatar || ''} alt={user?.name || 'User'} />
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {user?.name?.substring(0, 2) || 'U'}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="flex flex-col items-start space-y-1">
                <span className="font-medium">{user?.name}</span>
                <span className="text-sm text-muted-foreground">{user?.email}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">{user?.role}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Profile</DropdownMenuItem>
              <DropdownMenuItem>Settings</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-red-500 dark:text-red-400">
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
};

export default Header;

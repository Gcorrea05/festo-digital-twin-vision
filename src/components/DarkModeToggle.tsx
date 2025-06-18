
import React from 'react';
import { Button } from '@/components/ui/button';
import { Moon, Sun } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from '@/components/ui/use-toast';
import { useTheme } from '@/context/ThemeContext';

const DarkModeToggle: React.FC = () => {
  const { isDarkMode, toggleDarkMode } = useTheme();
  
  const handleToggle = (dark: boolean) => {
    toggleDarkMode(dark);
    
    toast({
      title: dark ? "Dark mode activated" : "Light mode activated",
      description: dark 
        ? "FESTO Digital Twin interface is now in dark mode." 
        : "FESTO Digital Twin interface is now in light mode.",
      duration: 2000,
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="rounded-full bg-background hover:bg-accent">
          <Sun className={`h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all ${isDarkMode ? "opacity-0" : "opacity-100"}`} />
          <Moon className={`absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all ${isDarkMode ? "rotate-0 scale-100 opacity-100" : "opacity-0"}`} />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleToggle(false)} className="flex items-center gap-2">
          <Sun className="h-4 w-4" />
          <span>Light Mode</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleToggle(true)} className="flex items-center gap-2">
          <Moon className="h-4 w-4" />
          <span>Dark Mode</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default DarkModeToggle;

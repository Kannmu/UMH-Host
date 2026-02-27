import React from 'react';
import { LayoutDashboard, Cuboid, Settings, Activity } from 'lucide-react';
import clsx from 'clsx';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange }) => {
  const items = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'visualizer', label: '3D Control', icon: Cuboid },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="w-64 h-full bg-card border-r border-border flex flex-col p-4">
      <div className="flex items-center gap-2 mb-8 px-2">
        <Activity className="w-6 h-6 text-primary" />
        <h1 className="font-bold text-lg">UMH Host</h1>
      </div>
      
      <nav className="space-y-1">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={clsx(
              "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
              activeTab === item.id 
                ? "bg-primary/10 text-primary" 
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </button>
        ))}
      </nav>
      
      <div className="mt-auto">
        <div className="text-xs text-muted-foreground px-2">
          v0.1.0
        </div>
      </div>
    </div>
  );
};

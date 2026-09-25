'use client';

import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Light/dark switch. The system setting applies until the admin picks one;
 * the choice is remembered in this browser (see the script in app/layout.tsx).
 */
export function ThemeToggle() {
  const toggle = () => {
    const dark = document.documentElement.classList.toggle('dark');
    try {
      localStorage.setItem('sajha-theme', dark ? 'dark' : 'light');
    } catch {
      // Private mode: the switch still works for this page.
    }
  };
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label="Switch light or dark theme">
      <Sun className="dark:hidden" />
      <Moon className="hidden dark:block" />
    </Button>
  );
}

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface ThemeContextType {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
  systemTheme: 'light' | 'dark';
  isSystemTheme: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: 'light' | 'dark' | 'system';
  storageKey?: string;
}

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'theme'
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<'light' | 'dark'>('light');
  const [systemTheme] = useState<'light' | 'dark'>('light');
  const [isSystemTheme, setIsSystemTheme] = useState(defaultTheme === 'system');

  // Detect system theme preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const updateSystemTheme = (e: MediaQueryListEvent) => {
      const newSystemTheme = e.matches ? 'dark' : 'light';
      setThemeState(newSystemTheme);

      // Update theme if using system preference
      if (isSystemTheme) {
        applyTheme(newSystemTheme);
        setThemeState(newSystemTheme);
      }
    };

    // Set initial system theme
    const initialSystemTheme = mediaQuery.matches ? 'dark' : 'light';
    setThemeState(initialSystemTheme);

    // Listen for system theme changes
    mediaQuery.addEventListener('change', updateSystemTheme);

    return () => {
      mediaQuery.removeEventListener('change', updateSystemTheme);
    };
  }, [isSystemTheme]);

  // Initialize theme from localStorage or system preference
  useEffect(() => {
    const storedTheme = localStorage.getItem(storageKey);

    let initialTheme: 'light' | 'dark';
    let useSystemTheme = false;

    if (storedTheme === 'light' || storedTheme === 'dark') {
      initialTheme = storedTheme;
    } else if (storedTheme === 'system' || defaultTheme === 'system') {
      initialTheme = systemTheme;
      useSystemTheme = true;
    } else {
      initialTheme = defaultTheme === 'dark' ? 'dark' : 'light';
    }

    setThemeState(initialTheme);
    setIsSystemTheme(useSystemTheme);
    applyTheme(initialTheme);
  }, [defaultTheme, storageKey, systemTheme]);

  // Apply theme to document
  const applyTheme = (newTheme: 'light' | 'dark') => {
    const root = document.documentElement;

    // Toggle dark class
    root.classList.toggle('dark', newTheme === 'dark');

    // Set data attribute
    root.setAttribute('data-theme', newTheme);

    // Update CSS custom properties
    if (newTheme === 'dark') {
      root.style.setProperty('--toast-bg', '#1f2937');
      root.style.setProperty('--toast-color', '#ffffff');
      root.style.setProperty('--scrollbar-track', '#374151');
      root.style.setProperty('--scrollbar-thumb', '#6b7280');
      root.style.setProperty('--scrollbar-thumb-hover', '#9ca3af');
      root.style.setProperty('--glass-bg', 'rgba(0, 0, 0, 0.3)');
      root.style.setProperty('--glass-border', 'rgba(255, 255, 255, 0.1)');
    } else {
      root.style.setProperty('--toast-bg', '#ffffff');
      root.style.setProperty('--toast-color', '#1f2937');
      root.style.setProperty('--scrollbar-track', '#f3f4f6');
      root.style.setProperty('--scrollbar-thumb', '#d1d5db');
      root.style.setProperty('--scrollbar-thumb-hover', '#9ca3af');
      root.style.setProperty('--glass-bg', 'rgba(255, 255, 255, 0.1)');
      root.style.setProperty('--glass-border', 'rgba(255, 255, 255, 0.2)');
    }
  };

  const setTheme = (newTheme: 'light' | 'dark') => {
    setThemeState(newTheme);
    setIsSystemTheme(false);
    applyTheme(newTheme);
    localStorage.setItem(storageKey, newTheme);
  };

  // const setSystemThemePreference = (useSystem: boolean = true) => {
  //   setIsSystemTheme(useSystem);

  //   if (useSystem) {
  //     const currentSystemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  //     setThemeState(currentSystemTheme);
  //     applyTheme(currentSystemTheme);
  //     localStorage.setItem(storageKey, 'system');
  //   }
  // };

  const toggleTheme = () => {
    if (isSystemTheme) {
      // If using system theme, switch to opposite of current system theme
      const newTheme = systemTheme === 'dark' ? 'light' : 'dark';
      setTheme(newTheme);
    } else {
      // If using manual theme, toggle it
      const newTheme = theme === 'dark' ? 'light' : 'dark';
      setTheme(newTheme);
    }
  };

  const value: ThemeContextType = {
    theme,
    toggleTheme,
    setTheme,
    systemTheme,
    isSystemTheme,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }

  return context;
}

// Hook for theme-aware animations
export function useThemeAnimation() {
  const { theme } = useTheme();

  const getThemeVariants = (lightVariants: any, darkVariants: any) => {
    return theme === 'dark' ? darkVariants : lightVariants;
  };

  return { getThemeVariants, theme };
}

// Component for theme-specific rendering
interface ThemeAwareProps {
  light?: ReactNode;
  dark?: ReactNode;
  children?: (theme: 'light' | 'dark') => ReactNode;
}

export function ThemeAware({ light, dark, children }: ThemeAwareProps) {
  const { theme } = useTheme();

  if (children) {
    return <>{children(theme)}</>;
  }

  return <>{theme === 'dark' ? dark : light}</>;
}

// Higher-order component for theme awareness
export function withTheme<P extends object>(Component: React.ComponentType<P & { theme: 'light' | 'dark' }>) {
  return function ThemedComponent(props: P) {
    const { theme } = useTheme();
    return <Component {...props} theme={theme} />;
  };
}

export default ThemeProvider;

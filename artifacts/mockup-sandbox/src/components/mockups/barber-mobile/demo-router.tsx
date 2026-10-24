import { createContext, useContext, useState, type MouseEvent, type ReactNode } from 'react';

type RouterContextValue = {
  location: string;
  setLocation: (location: string) => void;
};

const RouterContext = createContext<RouterContextValue | null>(null);

export function DemoRouter({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState('/');

  return (
    <RouterContext.Provider value={{ location, setLocation }}>
      {children}
    </RouterContext.Provider>
  );
}

export function useLocation(): [string, (location: string) => void] {
  const context = useContext(RouterContext);
  if (!context) throw new Error('DemoRouter provider is missing');
  return [context.location, context.setLocation];
}

export function Link({
  href,
  onClick,
  children,
  ...props
}: {
  href: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  children: ReactNode;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick' | 'children'>) {
  const [, setLocation] = useLocation();

  return (
    <a
      {...props}
      href={href}
      onClick={event => {
        event.preventDefault();
        setLocation(href);
        onClick?.(event);
      }}
    >
      {children}
    </a>
  );
}

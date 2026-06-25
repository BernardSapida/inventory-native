import { createContext, useContext, useState, ReactNode } from 'react';

interface SidebarCtx {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const Ctx = createContext<SidebarCtx>({ isOpen: false, open: () => {}, close: () => {} });

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Ctx.Provider value={{ isOpen, open: () => setIsOpen(true), close: () => setIsOpen(false) }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSidebar() {
  return useContext(Ctx);
}

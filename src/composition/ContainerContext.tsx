import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createContainer, type Container } from "./container";

const ContainerContext = createContext<Container | null>(null);

/** Builds the container once and provides it to the tree (single composition root). */
export function ContainerProvider({ children }: { children: ReactNode }) {
  const container = useMemo(() => createContainer(), []);
  return <ContainerContext.Provider value={container}>{children}</ContainerContext.Provider>;
}

export function useContainer(): Container {
  const container = useContext(ContainerContext);
  if (!container) {
    throw new Error("useContainer must be used within a ContainerProvider");
  }
  return container;
}

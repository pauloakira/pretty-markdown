import React from "react";
import ReactDOM from "react-dom/client";
import "katex/dist/katex.min.css";
import "./presentation/theme/theme.css";
import App from "./App";
import { ContainerProvider } from "./composition/ContainerContext";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ContainerProvider>
      <App />
    </ContainerProvider>
  </React.StrictMode>,
);

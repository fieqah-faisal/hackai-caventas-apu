import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import "./fonts";
import "@xyflow/react/dist/style.css";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

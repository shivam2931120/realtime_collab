import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import App from "./App";
import "./index.css";

const muiTheme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#10b981",
    },
    background: {
      default: "#0f0f0f",
      paper: "#161616",
    },
  },
  typography: {
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
  },
});

const AppTree = (
  <React.StrictMode>
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);

const root = ReactDOM.createRoot(document.getElementById("root")!);

root.render(AppTree);

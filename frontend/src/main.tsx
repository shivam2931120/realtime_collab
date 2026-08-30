import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import App from "./App";
import "./index.css";

const muiTheme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#e4572e" },
    background: { default: "#eef1f5", paper: "#ffffff" },
    text: { primary: "#101b28", secondary: "#5a6675" },
  },
  typography: {
    fontFamily: "IBM Plex Sans, Arial, sans-serif",
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

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import App from "./App";
import { ClerkProvider } from "@clerk/react";
import ClerkSessionBridge from "./components/ClerkSessionBridge";
import { clerkEnabled } from "./services/auth";
import "./index.css";

const muiTheme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#e4572e" },
    background: { default: "#101b28", paper: "#162231" },
    text: { primary: "#eef1f5", secondary: "#a9b7c8" },
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
        {clerkEnabled ? (
          <ClerkProvider
            publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
            signInUrl="/login"
            signUpUrl="/register"
            signInFallbackRedirectUrl="/dashboard"
            signUpFallbackRedirectUrl="/dashboard"
            appearance={{ variables: {
              colorPrimary: "#e4572e",
              colorPrimaryForeground: "#ffffff",
              colorBackground: "#162231",
              colorForeground: "#eef1f5",
              colorInput: "#101b28",
              colorInputForeground: "#eef1f5",
              colorMuted: "#243349",
              colorMutedForeground: "#a9b7c8",
              colorNeutral: "#ffffff",
              colorBorder: "#334155",
              borderRadius: "0px",
            } }}
          >
            <ClerkSessionBridge><App /></ClerkSessionBridge>
          </ClerkProvider>
        ) : <App />}
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);

const root = ReactDOM.createRoot(document.getElementById("root")!);

root.render(AppTree);

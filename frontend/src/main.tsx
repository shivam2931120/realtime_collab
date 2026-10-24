import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import App from "./App";
import { ClerkProvider } from "@clerk/react";
import ClerkSessionBridge from "./components/ClerkSessionBridge";
import { clerkEnabled } from "./services/auth";
import "./index.css";
import designTokens from "../design-tokens.json";

const colors = designTokens.colors;

const muiTheme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: colors.primary, contrastText: "#ffffff" },
    success: { main: colors.success },
    error: { main: colors.error },
    divider: colors.border,
    background: { default: colors.background, paper: colors.surface },
    text: { primary: colors.text, secondary: colors.muted },
  },
  shape: { borderRadius: 6 },
  typography: {
    fontFamily: "IBM Plex Sans, Arial, sans-serif",
    button: { textTransform: "none", fontWeight: 600, fontSize: ".8125rem" },
  },
  components: {
    MuiButton: { styleOverrides: { root: { boxShadow: "none", minHeight: 38 }, outlined: { borderColor: colors.border, color: colors.text } } },
    MuiDialog: { styleOverrides: { paper: { backgroundImage: "none", border: `1px solid ${colors.border}`, borderRadius: 14 } } },
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
              colorPrimary: colors.primary,
              colorPrimaryForeground: "#ffffff",
              colorBackground: colors.surface,
              colorForeground: colors.text,
              colorInput: colors.background,
              colorInputForeground: colors.text,
              colorMuted: colors["surface-high"],
              colorMutedForeground: colors.muted,
              colorNeutral: "#ffffff",
              colorBorder: colors.border,
              borderRadius: "6px",
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

import { ClerkProvider } from "@clerk/clerk-react";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import App from "./App";
import "./index.css";

import { dark } from "@clerk/themes";

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

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

ReactDOM.createRoot(document.getElementById("root")!).render(
  clerkPublishableKey ? (
    <ClerkProvider 
      publishableKey={clerkPublishableKey}
      localization={{
        signIn: {
          start: {
            title: "Sign in to Editorial",
            subtitle: "to continue to your workspace",
          },
        },
        signUp: {
          start: {
            title: "Sign up for Editorial",
            subtitle: "to create your workspace",
          },
        },
      }}
      appearance={{
        baseTheme: dark,
        layout: {
          logoImageUrl: "/logo.png",
          logoPlacement: "inside",
        },
        variables: {
          colorPrimary: "#10b981", // emerald-500
          colorBackground: "#131313",
          colorInputBackground: "rgba(255, 255, 255, 0.05)",
          colorInputText: "#ffffff",
          colorText: "#ffffff",
          colorTextSecondary: "#a3a3a3",
          borderRadius: "0.25rem",
        },
        elements: {
          card: "bg-surface-container border border-white/5 shadow-2xl",
          headerTitle: "text-white font-bold",
          headerSubtitle: "text-[#a3a3a3]",
          socialButtonsBlockButton: "border-white/10 hover:bg-white/5",
          socialButtonsBlockButtonText: "text-white font-semibold",
          dividerLine: "bg-white/10",
          dividerText: "text-[#a3a3a3]",
          formFieldLabel: "text-[#a3a3a3] font-bold uppercase tracking-widest text-[10px]",
          formFieldInput: "border-none focus:ring-1 focus:ring-primary",
          formButtonPrimary: "font-bold tracking-wide",
          footerActionText: "text-[#a3a3a3]",
          footerActionLink: "text-primary hover:text-emerald-400 font-semibold"
        }
      }}
    >
      {AppTree}
    </ClerkProvider>
  ) : (
    AppTree
  ),
);

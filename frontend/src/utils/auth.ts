import { useAuth, useClerk, useUser } from "@clerk/clerk-react";

export const isAuthDisabled = import.meta.env.VITE_DISABLE_AUTH === "true";

export const useAuthSafe = () => {
  if (isAuthDisabled) {
    return {
      isLoaded: true,
      isSignedIn: true,
      getToken: async () => null,
    } as const;
  }

  return useAuth();
};

export const useUserSafe = () => {
  if (isAuthDisabled) {
    return {
      user: {
        id: "demo-user",
        primaryEmailAddress: {
          emailAddress: "demo@local",
        },
      },
    } as const;
  }

  return useUser();
};

export const useClerkSafe = () => {
  if (isAuthDisabled) {
    return {
      signOut: async () => {},
    } as const;
  }

  return useClerk();
};

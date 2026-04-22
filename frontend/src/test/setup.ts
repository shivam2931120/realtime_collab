import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { setupServer } from "msw/node";
import { handlers } from "./mswHandlers";

const server = setupServer(...handlers);

beforeAll(() => {
  server.listen({ onUnhandledRequest: "bypass" });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

vi.mock("@clerk/clerk-react", async () => {
  const actual = await vi.importActual<any>("@clerk/clerk-react");
  return {
    ...actual,
    useAuth: () => ({ isLoaded: true, isSignedIn: true }),
    useUser: () => ({ user: { primaryEmailAddress: { emailAddress: "tester@example.com" } } }),
    useClerk: () => ({ signOut: vi.fn() }),
  };
});

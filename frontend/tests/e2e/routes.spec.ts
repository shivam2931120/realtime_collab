import { expect, Page, Route, test } from "@playwright/test";

const now = "2026-05-16T09:00:00.000Z";
const user = { id: "usr_cm91dGVAZXhhbXBsZS5jb20", email: "route@example.com" };
const document = {
  id: "doc-1",
  title: "Route Smoke Doc",
  content: "<p>Short route smoke content.</p>",
  owner: user,
  collaborators: [{ id: "usr_dmlld2VyQGV4YW1wbGUuY29t", email: "viewer@example.com", role: "viewer" }],
  role: "owner",
  folderId: null,
  createdAt: now,
  updatedAt: now,
};

const sessionPayload = {
  token: "route-smoke-token",
  user,
};

const analyticsPayload = {
  rangeDays: 30,
  summary: {
    totalDocuments: 1,
    ownedDocuments: 1,
    sharedWithMe: 0,
    events: 2,
    views: 1,
    edits: 1,
    shares: 0,
    imports: 0,
    exports: 0,
    comments: 0,
    versions: 0,
  },
  timeline: [{ date: "2026-05-16", events: 2 }],
  topDocs: [{ documentId: document.id, title: document.title, events: 2 }],
};

const fulfillJson = (route: Route, body: unknown) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

const mockApi = async (page: Page) => {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const path = url.pathname;

    if (method === "POST" && path === "/api/auth/session") {
      return fulfillJson(route, sessionPayload);
    }

    if (method === "GET" && path === "/api/auth/me") {
      return fulfillJson(route, { user });
    }

    if (method === "GET" && path === "/api/notifications") {
      return fulfillJson(route, { notifications: [], unreadCount: 0 });
    }

    if (method === "GET" && path === "/api/docs/folders") {
      return fulfillJson(route, { folders: [] });
    }

    if (method === "GET" && path === "/api/docs/tags") {
      return fulfillJson(route, { tags: [{ name: "smoke", count: 1 }] });
    }

    if (method === "GET" && path === "/api/docs/search") {
      return fulfillJson(route, {
        results: [
          {
            id: document.id,
            title: document.title,
            snippet: "Short route smoke content.",
            tags: ["smoke"],
            updatedAt: document.updatedAt,
            score: 10,
          },
        ],
      });
    }

    if (method === "GET" && path === "/api/docs/templates") {
      return fulfillJson(route, {
        templates: [
          {
            id: "default-route-smoke",
            title: "Route Template",
            content: "<h1>Route Template</h1>",
            tags: ["smoke"],
            isSystem: true,
            createdAt: now,
            updatedAt: now,
          },
        ],
      });
    }

    if (method === "GET" && path === "/api/docs/analytics") {
      return fulfillJson(route, analyticsPayload);
    }

    if (method === "GET" && path === "/api/docs/doc-1/comments") {
      return fulfillJson(route, { comments: [] });
    }

    if (method === "GET" && path === "/api/docs/doc-1/tags") {
      return fulfillJson(route, { tags: ["smoke"] });
    }

    if (method === "GET" && path === "/api/docs/doc-1") {
      return fulfillJson(route, { document });
    }

    if (method === "GET" && path === "/api/docs") {
      return fulfillJson(route, { documents: [document] });
    }

    throw new Error(`Unhandled API mock: ${method} ${path}`);
  });
};

const seedSession = async (page: Page) => {
  await page.addInitScript((payload) => {
    window.localStorage.setItem("editorial.session", JSON.stringify(payload));
  }, sessionPayload);
};

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test("email session redirects into the protected workspace", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("you@company.com").fill(user.email);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Recent Documents" })).toBeVisible();
});

[
  ["/dashboard", "Recent Documents"],
  ["/discover", "Discover"],
  ["/library", "Library"],
  ["/analytics", "Analytics Dashboard"],
  ["/drafts", "Drafts"],
  ["/collections", "Collections"],
  ["/teams", "Team"],
  ["/settings", "Settings"],
  ["/editor/doc-1", "Route Smoke Doc"],
  ["/docs/doc-1", "Route Smoke Doc"],
].forEach(([path, heading]) => {
  test(`protected route renders ${path}`, async ({ page }) => {
    await seedSession(page);
    await page.goto(path);

    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  });
});

# Nexus integration boundary

Editorial remains a standalone collaboration product. Nexus does not import Editorial source code at build time, call Editorial APIs at runtime, share Editorial authentication tokens, or read/write Editorial's Supabase tables.

The integration model is capability replication with separate adapters:

- Editorial keeps React/Vite, Express, Socket.IO, Supabase, its own authentication, and its own deployments.
- Nexus implements the selected collaboration behaviors natively with Next.js, Spring Boot, STOMP, PostgreSQL/Flyway, and Nexus Clerk/JWT organization authorization.
- Improvements may be ported deliberately between projects, but neither repository is a package or service dependency of the other.
- Documents and users are not automatically synchronized. Any future migration must be an explicit, auditable import rather than a hidden runtime bridge.

This boundary ensures an outage, deployment, credential change, or schema migration in one project cannot stop the other project.


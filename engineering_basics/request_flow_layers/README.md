---
description: (Controller → Service → Repository)
---

# Request Flow Layers (Controller -> Service -> Repository)

Overview of the backend request-flow layers and their boundaries.

## Layers vs. Modules

- **Layers** = technical responsibilities in the request flow (controller/service/repository)
- **Modules** = feature/domain grouping inside larger services (for example `modules/deals`, `modules/merchants`)

Both are valid and often used together.

## Responsibility Split (Quick Reference)

| Layer | Primary responsibility | Avoid |
|---|---|---|
| Controller | API endpoint definition, request validation, auth/authz, delegation | business logic, direct DB access |
| Service | business logic, orchestration, cross-service calls | HTTP-specific concerns, raw DB queries |
| Repository | DB/ORM queries, transactions, persistence mapping | auth/RBAC, business branching, external service calls |

## Canonical References

- [Controllers & API Endpoints](../controllers_api_endpoints.md)
- [Service Architecture & Patterns](../service_architecture_patterns.md)
- [Repository Patterns](../repository_patterns.md)
- [Error Handling](../errors.md)
- [Folder Structure & Naming](../folder_structure_and_naming.md)
- [Naming Convention](../naming_convention.md)
- [Database & Repository Standards (Hub)](../database_repository_standards.md)

---
description: (Controller → Service → Repository)
---

# Request Flow Layers (Controller → Service → Repository)

The path one request takes through `apps/api`, and what each layer is responsible for.

## The path

```
browser (apps/web, lib/api/client.ts)
  │  Authorization: Bearer <token>   [X-Acting-Company: <company id>, superadmin only]
  ▼
auth handler   apps/api/lib/auth.handler.ts
  │  checks the token and the user → AuthData { userID, companyID, role, homeCompanyID }
  ▼
controller     services/<service>/controllers/<name>.controller.ts
  │  Encore has validated the request type; requireRole(...) or getAuthData()!
  │  passes companyID (+ userID, role) to the service
  ▼
service        services/<service>/services/<entity>.service.ts
  │  rules, APIError, ~encore/clients calls, topics/outbox, transactions, rows → API items
  ▼
repository     services/<service>/repositories/<entity>.repository.ts
  │  Drizzle queries, every one filtered by company_id (TenantRepository)
  ▼
the service's own Postgres database   services/<service>/db/db.ts
```

## Responsibility split

| Layer | Primary responsibility | Avoid |
|---|---|---|
| Controller | Endpoint definition, request/response interfaces, role check, delegation | Queries, business rules, schema or Drizzle imports |
| Service | Business rules, checks that need data, cross-service calls, events, transactions, mapping rows to items | Reading headers or the token; queries outside a repository |
| Repository | Drizzle queries scoped by `company_id`, multi-statement transactions | Business branching, role checks, calls to other services |

Pure helpers (`lib/`, `utils/`) can be used by any layer and touch no database.

## One example

`DELETE /holidays/:id`:

1. `holidayDelete` (controller) calls `requireRole("superadmin", "admin", "manager")` and passes `req.id` and the actor's `companyID`.
2. `holidaysService.remove(id, companyId)` (service) deletes, and throws `APIError.notFound("Holiday not found")` when nothing was deleted.
3. `publicHolidayRepository.softDeleteForCompany(id, companyId)` (repository, from `TenantRepository`) sets `deleted_at` on that company's row only.

## Read next

- [Controllers & API Endpoints](../controllers_api_endpoints.md)
- [Service Architecture & Patterns](../service_architecture_patterns.md)
- [Repository Patterns](../repository_patterns.md)
- [Database & Repository Standards](../database_repository_standards.md)
- [Error Handling](../errors.md)
- [Folder Structure](../folder_structure_and_naming.md)
- [Naming Convention](../naming_convention.md)

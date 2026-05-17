# DTO



## Data Contracts: DTOs, Interfaces & Validation

Firstly, Encore offer solid input validation schema in TS and Go. https://encore.dev/docs/ts/primitives/validation#examples

```ts

// Encore Validator
interface UserCreateRequest {
  // Number between 3 and 1000 (inclusive)
  count: number & (Min<3> & Max<1000>);

  // String between 5 and 20 characters
  username: string & (MinLen<5> & MaxLen<20>);

  // Must be either a valid URL or email address
  contact: string & (IsURL | IsEmail);

  // Array of up to 10 email addresses
  recipients: Array<string & IsEmail> & MaxLen<10>;
}


```

```ts

// zod Validator 
import { z } from "zod";


/**
 * Update Deal Type Controller input
 */
export const dealCustomFieldUpdate = api(
    { expose: true, auth: true, method: "PUT", path: "/xxxxx/custom_field" },
    async (params: DealCustomFieldUpdateRequest): Promise<DealCustomFieldResponse> => {

        // Valid incoming object
        const validObject = DealCustomFieldUpdateRequestValidator.safeParse(params);

        // Return invalid object
        if (validObject.error) {
            throw new APIError(ErrCode.InvalidArgument, "Object is not valid").withDetails({ errors: validObject.error.errors });
        }

        // Return response
        return await someService.updateCustomField(validObject);
    },
);

// Request interface like normal
export interface DealCustomFieldUpdateRequest {
    id: string;
    text: string;
    some_number: number;
    advance_object: DealCustomFieldUpdateDefaultContent;
}

// Validator schema for Zod (Recomended tocreate via AI from original DealCustomFieldUpdateRequest
// with basic description what you wan to achive
export const DealCustomFieldUpdateRequestValidator = z.object({
    id: defaultGroupon_objectId, // MongoDB Validator
    text: z.enum(['email_address', 'url']).optional(),
    some_number: z.number().int().min(1, "Count on Page must be at least 1").max(100, "Count on Page limit is 100"),
    advance_object: DealCustomFieldCheckBoxSchema.nullable().optional(),
});

```

**Rules**

* **All** external inputs validated by schema (Zod or Encore native).
  * **NEVER** validate inputs in services manually like

```ts
  if (!name || !duration || !pds_type) {
        log.error("[Admin.createPDSGroup] Missing required fields", { name, duration, pds_type });
        throw APIError.invalidArgument("Missing required fields");
  }
```

* Keep DTOs small and stable; version when breaking.

***

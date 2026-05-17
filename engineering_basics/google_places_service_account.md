## Google Places API via Service Account

This guide explains how our backend calls the Google Places API (v1) using a Google Cloud Service Account, including required headers `X-Goog-User-Project` and `X-Goog-FieldMask`.

### Overview

- **Auth method**: OAuth 2.0 using a Google Cloud Service Account.
- **Library**: `google-auth-library` to mint access tokens.
- **Transport**: Direct HTTPS calls to Places API v1 using `fetch`.
- **Key headers**:
  - **X-Goog-User-Project**: Must be set to the correct Google Cloud Project ID that has Places API enabled and billing attached. Requests fail without the correct value.
  - **X-Goog-FieldMask**: Specifies which fields to return to control payload size, performance, and cost.

### Where this is implemented

The implementation lives in `apps/encore/apps/google-places/service.ts`.

```14:33:apps/encore/apps/google-places/service.ts
// Google service account credentials
const GOOGLE_PLACES_SERVICE_ACCOUNT = secret("GOOGLE_PLACES_SERVICE_ACCOUNT");

class GooglePlacesService {
  private authClient: GoogleAuth;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private encoreProjectId = "prj-grp-encore-stable-7ca3";

  constructor() {
    // Initialize Google Auth client with service account
    this.authClient = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
      credentials: JSON.parse(GOOGLE_PLACES_SERVICE_ACCOUNT()),
    });
  }
}
```

### Required Google Cloud setup

- **Enable APIs**: Enable the new Places API (`places.googleapis.com`) in the billing project.
- **Billing**: Ensure the project has an active billing account.
- **Service Account**: Create a service account and download its JSON key.
- **Permissions for quota/billing**: Grant the service account the role **Service Usage Consumer** (`roles/serviceusage.serviceUsageConsumer`) on the billing project you will pass in `X-Goog-User-Project`.

### Secrets management

Store the service account JSON in the Encore secret `GOOGLE_PLACES_SERVICE_ACCOUNT` (value is the raw JSON string). Example for local:

```bash
encore secret set --type local GOOGLE_PLACES_SERVICE_ACCOUNT
```

Paste the full service account JSON when prompted.

### Authentication flow (server-side)

1. Parse service account JSON from secret.
2. Initialize `GoogleAuth` with `cloud-platform` scope.
3. Retrieve a Bearer access token via `getRequestHeaders()`.
4. Send HTTPS requests with the Bearer token and the mandatory headers.

### Calling Places API (examples)

#### Autocomplete

```257:265:apps/encore/apps/google-places/service.ts
const response = await fetch(url, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat",
    "X-Goog-User-Project": this.encoreProjectId,
  },
  body: JSON.stringify(requestBody),
});
```

Endpoint: `POST https://places.googleapis.com/v1/places:autocomplete`

- **X-Goog-User-Project**: See details below. Must be a valid project ID.
- **X-Goog-FieldMask**: We request only the prediction `placeId`, the display `text`, and `structuredFormat` to keep responses minimal.

#### Place Details

```305:312:apps/encore/apps/google-places/service.ts
const response = await fetch(url, {
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "X-Goog-FieldMask":
      "id,displayName,formattedAddress,addressComponents,location,internationalPhoneNumber,websiteUri,types,nationalPhoneNumber,editorialSummary",
    "X-Goog-User-Project": this.encoreProjectId,
  },
});
```

Endpoint: `GET https://places.googleapis.com/v1/places/{placeId}`

### About X-Goog-User-Project

- **What it is**: A header that tells Google which project to bill and which project's quota to use for the request.
- **Must be correct**: The value must be the exact Google Cloud Project ID (not project number) of a project with Places API enabled and billing attached. If it is missing or incorrect, requests will fail (e.g., with permission or billing errors).
- **Our code**: The project ID is set to `prj-grp-encore-stable-7ca3` in the service class. Ensure this matches the environment you deploy to.
- **Permissions**: The calling service account must have access to consume the API in that project (e.g., `roles/serviceusage.serviceUsageConsumer`).

### About X-Goog-FieldMask

- **What it is**: A comma-separated list of fields to include in the response. The Places API v1 uses field masks to reduce payload size, improve latency, and potentially lower cost.
- **How to use**: Specify the minimal set of fields your use-case requires.
  - Autocomplete example: `suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat`.
  - Details example: `id,displayName,formattedAddress,addressComponents,location,internationalPhoneNumber,websiteUri,types,nationalPhoneNumber,editorialSummary`.
- **Tip**: If you omit required fields, they will not be present in the response. When debugging, temporarily broaden the mask to verify available fields.

### cURL examples

Replace `ACCESS_TOKEN` and `YOUR_PROJECT_ID` accordingly.

```bash
curl -X POST "https://places.googleapis.com/v1/places:autocomplete" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Goog-User-Project: YOUR_PROJECT_ID" \
  -H "X-Goog-FieldMask: suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat" \
  -d '{
    "input": "groupon",
    "includedPrimaryTypes": ["establishment"]
  }'
```

```bash
curl "https://places.googleapis.com/v1/places/PLACE_ID" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Goog-User-Project: YOUR_PROJECT_ID" \
  -H "X-Goog-FieldMask: id,displayName,formattedAddress,addressComponents,location,internationalPhoneNumber,websiteUri,types,nationalPhoneNumber,editorialSummary"
```

### Troubleshooting

- Ensure the `X-Goog-User-Project` matches a project with Places API enabled and active billing.
- Verify the service account has permissions on that project.
- Check the field mask includes the properties you expect to read.
- Look for detailed error logs in the Encore logs if requests fail.



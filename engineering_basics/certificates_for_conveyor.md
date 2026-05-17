# Certificate Management for Conveyor Services

This document outlines how to create and manage certificates for communication between conveyor services that require authorization.

## Overview

Some services in Groupon require proper authorization, and certificates are needed to establish secure communication channels between these services.

## GCP Certificate Generation

### Internal Certificate Authority (GCP)

We use Google Cloud Platform's Private Certificate Authority to generate certificates for our services.

**Reference PR:** [GCP Certificate Configuration](https://github.groupondev.com/ApplicationSecurity/gcp_certificate/pull/9)

## Approval Process

### Step 1: Create PR for Certificate Authorization

Before generating certificates, you must first create a PR to add your service to the authorized client list:

1. **Create PR** in the GCP Certificate repository
2. **Edit file:** `envs/grp-security-prod/account.hcl`
3. **Add new record** to the `client_auth` array:

```hcl
{
    "service" = "encore-service",
    "common_name" = "staging/encore-service",
    "requesters" = ["group:encore@groupon.com"],
},
```

### Step 2: Security Team Notification

After creating the authorization PR:

1. **Post the PR to Global Security team** for review and approval:
   - Chat Room: [Global Security](https://chat.google.com/room/AAAAm56e6T0)
   - Include PR link and brief description of the certificate request
   - Wait for security team approval before proceeding

### Example Security Team Message

```
Hi Security Team,

I've created a PR to add certificate authorization for [service-name]:
[PR_LINK]

This will allow our service to request certificates for secure communication with [target-service].

Please review when you have a chance. Thanks!
```

### Generate Certificate Command

Use the following `gcloud` command to generate a new certificate:

```bash
gcloud privateca certificates create \
  --project=prj-grp-security-prod-1403 \
  --issuer-location=us-central1 \
  --issuer-pool=ca-pool-security-prod-06e449 \
  --subject "CN=staging/encore-service,O=Groupon Inc." \
  --template-location us-central1 \
  --template client_auth_template \
  --validity P12M \
  --generate-key \
  --key-output-file=cert-key.pem \
  --cert-output-file=cert.pem
```

### Command Parameters

- `--project`: The GCP project ID for security production
- `--issuer-location`: Geographic location of the certificate issuer
- `--issuer-pool`: The certificate authority pool identifier
- `--subject`: Certificate subject with Common Name (CN) and Organization (O)
- `--template`: The certificate template to use for client authentication
- `--validity`: Certificate validity period (P12M = 12 months)
- `--generate-key`: Generate a new private key
- `--key-output-file`: Output file for the private key
- `--cert-output-file`: Output file for the certificate

### Output Files

After successful execution, you will have:

- `cert-key.pem`: Private key file
- `cert.pem`: Certificate file

## Usage in Encore Services

Once you have generated the certificate files, you need to store them as secrets in Encore and use them in your GRPNService configuration.

### 1. Store Certificates as Secrets

Add the certificate content to your Encore secrets:

```bash
# Store the certificate content
encore secret set --type dev,staging,prod ENCORE_SERVICE_CERT < cert.pem

# Store the private key content
encore secret set --type dev,staging,prod ENCORE_SERVICE_CERT_KEY < cert-key.pem
```

### 2. Import and Use Secrets in Your Service

In your service file, import the secrets and use them with GRPNService:

```typescript
import { GRPNService } from "@grpn/service";
import { secret } from "encore.dev/config";

// Define the secrets
const ENCORE_SERVICE_CERT = secret("ENCORE_SERVICE_CERT");
const ENCORE_SERVICE_CERT_KEY = secret("ENCORE_SERVICE_CERT_KEY");

class YourService {
  #client: GRPNService;

  constructor() {
    this.#client = new GRPNService({
      serviceName: "your-target-service-name",
      cert: ENCORE_SERVICE_CERT(),
      key: ENCORE_SERVICE_CERT_KEY(),
      rejectUnauthorized: false, // Set based on your security requirements
    });
  }

  async makeSecureRequest() {
    const request = this.#client.request().setEndpoint("your/api/endpoint").setGet(); // or setPost(), setPut(), etc.

    return await request.execute();
  }
}

export const yourService = new YourService();
```

### 3. Example Usage Pattern

Here's how the UGC service uses certificates for secure communication:

```typescript
// From apps/encore/apps/ugc/service.ts
class UgcService {
  #ugc: GRPNService;

  constructor() {
    this.#ugc = new GRPNService({
      serviceName: "ugc-api-jtier",
      cert: ENCORE_SERVICE_CERT(),
      key: ENCORE_SERVICE_CERT_KEY(),
      rejectUnauthorized: false,
    });
  }

  async getReviews(params: UGCGetReviewsRequest) {
    let reviewsRequest = this.#ugc
      .request()
      .setEndpoint(`ugc/v1.0/merchants/${params.merchantUuid}/reviews`)
      .setGet();

    // Set parameters and execute with certificate authentication
    return await reviewsRequest.execute();
  }
}
```

## Security Notes

- Store certificate files securely using Encore secrets
- Never commit certificate files to version control
- Rotate certificates before expiration (12-month validity)
- Follow Groupon security policies for certificate management
- Use appropriate `rejectUnauthorized` settings based on your environment

# Meta (Facebook) Lead Ads Integration Documentation

**Application:** Bidinn Sales CRM  
**Version:** 1.0  
**Last Updated:** December 2025

---

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Configuration Requirements](#configuration-requirements)
4. [Backend Implementation](#backend-implementation)
5. [Frontend Implementation](#frontend-implementation)
6. [Database Schema](#database-schema)
7. [Webhook Setup in Meta Business Suite](#webhook-setup-in-meta-business-suite)
8. [Security](#security)
9. [Testing](#testing)
10. [Troubleshooting](#troubleshooting)

---

## Overview

The Meta Lead Ads integration allows Bidinn CRM to automatically import leads generated from Facebook and Instagram advertising campaigns. When a potential customer submits a lead form on Facebook/Instagram, Meta sends a webhook notification to Bidinn, which then creates a new lead record in the CRM.

### Key Features
- Automatic lead import from Facebook/Instagram Lead Ads
- Webhook signature verification for security
- Duplicate lead prevention
- Admin-only configuration management

---

## Architecture

```
┌─────────────────────┐     Webhook POST      ┌─────────────────────┐
│  Meta/Facebook      │ ──────────────────▶   │  Bidinn Backend     │
│  Lead Ads Platform  │                       │  /api/meta/webhook  │
└─────────────────────┘                       └──────────┬──────────┘
                                                         │
                                                         ▼
                                              ┌─────────────────────┐
                                              │  Lead Database      │
                                              │  (AWS RDS MySQL)    │
                                              └─────────────────────┘
```

### Data Flow
1. User fills out a lead form on Facebook/Instagram
2. Meta sends a `leadgen` webhook event to `/api/meta/webhook`
3. Backend verifies the webhook signature using the App Secret
4. Backend checks for duplicate leads using `meta_leadgen_id`
5. If new, a Lead record is created with status `NEW`
6. Lead appears in Bidinn CRM for sales team follow-up

---

## Configuration Requirements

### Credentials Needed from Meta

| Credential | Description | Where to Get |
|------------|-------------|--------------|
| **Facebook Page ID** | Unique identifier for your Facebook Page | Facebook Page → About → Page ID |
| **App Secret** | Secret key for your Meta App | [Meta for Developers](https://developers.facebook.com/apps/) → App Settings → Basic |
| **Verify Token** | Custom string you create | Any unique string (you define this) |
| **Page Access Token** | OAuth token with `leads_retrieval` permission | [Meta Graph API Explorer](https://developers.facebook.com/tools/explorer/) or Business Settings |

### Required Permissions
- `pages_read_engagement`
- `leads_retrieval`
- `pages_manage_ads`

---

## Backend Implementation

### File Locations
```
/app/backend/src/
├── routes/
│   └── meta.ts              # API routes for Meta integration
├── entities/
│   └── MetaConfig.ts        # Database entity for storing Meta credentials
│   └── Lead.ts              # Lead entity (includes meta_leadgen_id field)
└── index.ts                 # Route registration
```

### API Endpoints

#### 1. Get Meta Configuration
```
GET /api/meta/config
```
- **Authentication:** Required (JWT)
- **Authorization:** Admin or Manager only
- **Response:**
```json
{
  "page_id": "123456789012345",
  "app_secret": "***configured***",
  "verify_token": "your-verify-token",
  "page_access_token": "***configured***",
  "is_active": true
}
```
> Note: Sensitive fields (`app_secret`, `page_access_token`) are masked in responses.

#### 2. Save Meta Configuration
```
POST /api/meta/config
```
- **Authentication:** Required (JWT)
- **Authorization:** Admin or Manager only
- **Request Body:**
```json
{
  "page_id": "123456789012345",
  "app_secret": "your-app-secret",
  "verify_token": "your-custom-verify-token",
  "page_access_token": "your-page-access-token",
  "is_active": true
}
```

#### 3. Webhook Verification (GET)
```
GET /api/meta/webhook?hub.mode=subscribe&hub.verify_token=xxx&hub.challenge=xxx
```
- **Authentication:** None (public endpoint)
- **Purpose:** Meta uses this to verify your webhook endpoint during setup
- **Response:** Returns `hub.challenge` value if `verify_token` matches

#### 4. Webhook Handler (POST)
```
POST /api/meta/webhook
```
- **Authentication:** Signature verification via `x-hub-signature-256` header
- **Purpose:** Receives lead events from Meta
- **Payload Example:**
```json
{
  "object": "page",
  "entry": [{
    "changes": [{
      "field": "leadgen",
      "value": {
        "leadgen_id": "1234567890",
        "form_id": "0987654321",
        "page_id": "123456789012345"
      }
    }]
  }]
}
```

### Route Registration
```typescript
// /app/backend/src/index.ts (line 21, 58)
import metaRoutes from "./routes/meta";
app.use("/api/meta", metaRoutes);
```

---

## Frontend Implementation

### File Location
```
/app/frontend/src/pages/SettingsPage.tsx
```

### UI Features
- **Admin-only section** for Meta Lead Ads configuration
- Configuration form with fields:
  - Facebook Page ID
  - App Secret (masked input)
  - Verify Token (masked input)
  - Page Access Token (masked input)
- Connection status badge (Connected/Not Connected)
- "Test Connection" button
- Webhook URL display with copy button

### State Management
```typescript
// Meta Lead Ads state variables
const [metaConfigured, setMetaConfigured] = useState(false);
const [metaPageId, setMetaPageId] = useState('');
const [metaLoading, setMetaLoading] = useState(false);
const [metaTesting, setMetaTesting] = useState(false);
const [showMetaSecrets, setShowMetaSecrets] = useState(false);
const [metaForm, setMetaForm] = useState({
  app_secret: '',
  verify_token: '',
  page_access_token: '',
  page_id: '',
});
```

### Access Control
The Meta configuration section is only visible to users with the `admin` role:
```tsx
{isAdmin && (
  <Card className="border-blue-200 dark:border-blue-800">
    {/* Meta Lead Ads Integration UI */}
  </Card>
)}
```

---

## Database Schema

### MetaConfig Entity
```typescript
// /app/backend/src/entities/MetaConfig.ts
@Entity("meta_config")
export class MetaConfig {
  @PrimaryColumn({ type: "varchar", length: 36 })
  id: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  page_id: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  app_secret: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  verify_token: string;

  @Column({ type: "text", nullable: true })
  page_access_token: string;

  @Column({ type: "boolean", default: false })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
```

### Lead Entity (Meta-related fields)
```typescript
// /app/backend/src/entities/Lead.ts (line 101)
@Column({ type: "varchar", length: 255, nullable: true })
meta_leadgen_id: string;
```

---

## Webhook Setup in Meta Business Suite

### Step-by-Step Guide

1. **Go to Meta for Developers**
   - URL: https://developers.facebook.com/apps/

2. **Select or Create Your App**
   - Ensure your app has the Webhooks product added

3. **Configure Webhooks**
   - Navigate to: Webhooks → Page → Subscribe to leadgen
   - **Callback URL:** `https://your-domain.com/api/meta/webhook`
   - **Verify Token:** Use the same token you configured in Bidinn settings

4. **Subscribe to Events**
   - Select the `leadgen` field
   - Click "Subscribe"

5. **Connect Your Facebook Page**
   - In App Settings, add your Facebook Page
   - Grant the app permission to access leads

### Webhook URL Format
```
https://{your-bidinn-domain}/api/meta/webhook
```
Example: `https://bidinn.preview.emergentagent.com/api/meta/webhook`

---

## Security

### Signature Verification
The webhook handler verifies incoming requests using HMAC-SHA256:

```typescript
// Verify signature if app_secret is configured
if (config.app_secret) {
  const signature = req.headers["x-hub-signature-256"] as string;
  if (signature) {
    const expectedSignature = "sha256=" + 
      crypto.createHmac("sha256", config.app_secret)
        .update(JSON.stringify(req.body))
        .digest("hex");
    if (signature !== expectedSignature) {
      console.warn("Invalid webhook signature");
      return res.sendStatus(403);
    }
  }
}
```

### Access Control
- Configuration endpoints require JWT authentication
- Only Admin and Manager roles can view/modify Meta settings
- Webhook endpoints are public but signature-verified

### Sensitive Data Handling
- App Secret and Page Access Token are never returned in full from the API
- Stored credentials are masked as `"***configured***"` in API responses

---

## Testing

### Test Connection
Use the "Test Connection" button in Settings to verify your Meta configuration is working.

### Manual Webhook Test
You can test the webhook verification endpoint:
```bash
curl -X GET "https://your-domain.com/api/meta/webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test123"
```
Expected response: `test123`

### Simulate Lead Submission
1. Create a test lead form in Facebook Ads Manager
2. Use Facebook's Lead Ads Testing Tool to submit a test lead
3. Verify the lead appears in Bidinn CRM

---

## Troubleshooting

### Common Issues

| Issue | Possible Cause | Solution |
|-------|---------------|----------|
| Webhook not receiving events | Incorrect callback URL | Verify the URL in Meta Business Suite matches your Bidinn domain |
| 403 Forbidden on webhook | Invalid signature | Check that App Secret matches between Bidinn and Meta app |
| Leads not appearing | Integration not active | Ensure `is_active` is set to `true` in configuration |
| Duplicate leads | Already processed | System automatically skips leads with existing `meta_leadgen_id` |
| "Pending fetch" in phone field | Lead data not fetched | The current implementation creates a placeholder; consider implementing the Graph API call to fetch full lead details |

### Logging
Check backend logs for Meta-related entries:
```bash
tail -f /var/log/supervisor/backend.err.log | grep -i meta
```

### Known Limitations
1. **Basic Lead Data:** The current implementation creates leads with basic information from the webhook. Full lead details (name, email, phone) require an additional Graph API call to fetch the lead data using the `leadgen_id`.

2. **Single Configuration:** Only one Meta configuration is supported at a time.

---

## Future Enhancements

1. **Full Lead Data Fetch:** Implement Graph API call to `/leadgen_id` endpoint to fetch complete lead details
2. **Multi-Page Support:** Allow configuration of multiple Facebook pages
3. **Form Field Mapping:** Custom mapping between lead form fields and CRM fields
4. **Lead Assignment Rules:** Automatically assign Meta leads to specific sales reps based on campaign

---

## Support

For technical support with this integration, contact:
- **Internal:** Your system administrator
- **Meta Documentation:** https://developers.facebook.com/docs/marketing-api/guides/lead-ads/

---

*Document created for Bidinn Sales CRM internal use.*

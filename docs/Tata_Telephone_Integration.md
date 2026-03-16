# Tata Smartflo Telephony Integration - Technical Documentation

**Application:** Bidinn Sales CRM  
**Integration:** Tata Tele Business Services (Smartflo)  
**Version:** 1.0  
**Last Updated:** December 2025  
**Document Type:** Technical Specification for Development Team

---

## Table of Contents
1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Architecture](#architecture)
4. [Authentication](#authentication)
5. [API Endpoints](#api-endpoints)
6. [Webhook Configuration](#webhook-configuration)
7. [Implementation Guide](#implementation-guide)
8. [Database Schema Changes](#database-schema-changes)
9. [Frontend Integration](#frontend-integration)
10. [Testing](#testing)
11. [Go-Live Checklist](#go-live-checklist)

---

## Overview

### Purpose
Integrate Tata Smartflo telephony services with Bidinn CRM to enable:
- **Click-to-Call**: Sales reps can initiate calls directly from lead cards
- **Call Logging**: Automatic logging of all inbound/outbound calls
- **Call Recording**: Access to call recordings linked to leads
- **Real-time Status**: Live call status updates in the CRM

### Benefits
- Reduced manual call logging effort
- Complete call history for each lead
- Performance tracking through call analytics
- Improved compliance with call recordings

---

## Prerequisites

### From Tata Smartflo
1. **Smartflo Account** with admin access
2. **API Key** generated from Smartflo dashboard
3. **DID Numbers** (Direct Inward Dialing) assigned to your account
4. **Agent Extensions** configured for each sales rep
5. **Webhook URL** whitelisted (Bidinn backend URL)

### From Bidinn Side
1. Backend server with HTTPS (required for webhooks)
2. Database access for schema updates
3. Frontend deployment capability

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           BIDINN CRM                                     │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐  │
│  │    Frontend      │    │    Backend       │    │    Database      │  │
│  │  (React + TS)    │◄──►│  (Express + TS)  │◄──►│  (MySQL/RDS)     │  │
│  │                  │    │                  │    │                  │  │
│  │  - Click to Call │    │  - /api/tata/*   │    │  - calls table   │  │
│  │  - Call Status   │    │  - Webhook handler│   │  - recordings    │  │
│  │  - Call History  │    │  - Call logging  │    │                  │  │
│  └──────────────────┘    └────────┬─────────┘    └──────────────────┘  │
│                                   │                                     │
└───────────────────────────────────┼─────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │        HTTPS/REST             │
                    │                               │
            ┌───────▼───────┐               ┌───────▼───────┐
            │  Click-to-Call │               │   Webhook     │
            │  (Outbound)    │               │  (Inbound)    │
            └───────┬───────┘               └───────┬───────┘
                    │                               │
                    └───────────┬───────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │   TATA SMARTFLO       │
                    │   Telephony Platform  │
                    │                       │
                    │  - Call Routing       │
                    │  - IVR                │
                    │  - Recording          │
                    │  - Analytics          │
                    └───────────────────────┘
```

---

## Authentication

### API Key Generation (Smartflo Dashboard)

1. Login to Smartflo: `https://smartflo.tatatelebusiness.com`
2. Navigate to: **API Connect** → **Click to Call Support API**
3. Click **Generate API Key**
4. Configure:
   - **My Numbers**: Select DIDs for outbound calls
   - **Destination**: Default agent/queue for calls
5. Copy the generated API key

### Store API Key Securely

Add to backend `.env` file:
```env
# Tata Smartflo Configuration
TATA_SMARTFLO_API_KEY=your_api_key_here
TATA_SMARTFLO_BASE_URL=https://api.smartflo.tatatelebusiness.com
TATA_SMARTFLO_WEBHOOK_SECRET=your_webhook_secret_here
```

---

## API Endpoints

### 1. Click to Call

**Endpoint:** `POST /v1/click_to_call`

**Headers:**
```
Authorization: Bearer {TATA_SMARTFLO_API_KEY}
Content-Type: application/json
```

**Request Body:**
```json
{
  "agent_number": "1001",           // Agent extension
  "customer_number": "+919876543210", // Customer phone (E.164 format)
  "caller_id": "+911234567890",     // DID number to show as caller ID
  "reference_id": "lead_abc123",    // Optional: Lead ID for tracking
  "record_call": true               // Enable call recording
}
```

**Response (Success):**
```json
{
  "status": "success",
  "call_id": "uuid-12345-67890",
  "message": "Call initiated successfully"
}
```

**Response (Error):**
```json
{
  "status": "error",
  "error_code": "AGENT_BUSY",
  "message": "Agent is currently on another call"
}
```

### 2. Get Live Calls

**Endpoint:** `GET /v1/live_calls`

**Response:**
```json
{
  "calls": [
    {
      "call_id": "uuid-12345",
      "agent_number": "1001",
      "customer_number": "+919876543210",
      "direction": "outbound",
      "status": "ringing",
      "start_time": "2025-12-16T10:30:00Z",
      "duration": 45
    }
  ]
}
```

### 3. Get Call Records

**Endpoint:** `GET /v1/call/records`

**Query Parameters:**
- `start_date`: YYYY-MM-DD
- `end_date`: YYYY-MM-DD
- `agent_number`: Filter by agent
- `page`: Pagination
- `limit`: Records per page

**Response:**
```json
{
  "records": [
    {
      "call_id": "uuid-12345",
      "agent_number": "1001",
      "customer_number": "+919876543210",
      "direction": "outbound",
      "status": "answered",
      "start_time": "2025-12-16T10:30:00Z",
      "end_time": "2025-12-16T10:35:00Z",
      "duration": 300,
      "recording_url": "https://recordings.smartflo.com/uuid-12345.mp3",
      "reference_id": "lead_abc123"
    }
  ],
  "pagination": {
    "total": 150,
    "page": 1,
    "limit": 50
  }
}
```

### 4. Get/Create Call Notes

**Endpoint:** `POST /v1/call/notes/{customer_number}`

**Request Body:**
```json
{
  "call_id": "uuid-12345",
  "notes": "Customer interested in premium package. Follow up next week.",
  "outcome": "interested",
  "agent_id": "1001"
}
```

---

## Webhook Configuration

### Webhook Setup in Smartflo

1. Go to **Settings** → **Webhooks** in Smartflo dashboard
2. Add new webhook:
   - **URL**: `https://your-domain.com/api/tata/webhook`
   - **Events**: `call.started`, `call.answered`, `call.ended`, `call.missed`
   - **Method**: POST
   - **Secret**: Generate and save for verification

### Webhook Payload Examples

#### Call Started Event
```json
{
  "event": "call.started",
  "timestamp": "2025-12-16T10:30:00Z",
  "data": {
    "call_id": "uuid-12345",
    "direction": "inbound",
    "caller_number": "+919876543210",
    "called_number": "+911234567890",
    "agent_number": "1001",
    "reference_id": "lead_abc123"
  },
  "signature": "sha256=xxxxx"
}
```

#### Call Ended Event
```json
{
  "event": "call.ended",
  "timestamp": "2025-12-16T10:35:00Z",
  "data": {
    "call_id": "uuid-12345",
    "direction": "inbound",
    "duration": 300,
    "status": "answered",
    "recording_url": "https://recordings.smartflo.com/uuid-12345.mp3",
    "hangup_cause": "normal_clearing"
  },
  "signature": "sha256=xxxxx"
}
```

### Webhook Signature Verification
```typescript
import crypto from 'crypto';

function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

---

## Implementation Guide

### Step 1: Create Backend Routes

Create file: `/app/backend/src/routes/tata.ts`

```typescript
import { Router, Response } from "express";
import axios from "axios";
import crypto from "crypto";
import { AppDataSource } from "../config/data-source";
import { Call, Lead } from "../entities";
import { authenticateToken, AuthRequest } from "../middleware/auth";

const router = Router();

const SMARTFLO_API_KEY = process.env.TATA_SMARTFLO_API_KEY;
const SMARTFLO_BASE_URL = process.env.TATA_SMARTFLO_BASE_URL || "https://api.smartflo.tatatelebusiness.com";
const WEBHOOK_SECRET = process.env.TATA_SMARTFLO_WEBHOOK_SECRET;

// Click to Call - Initiate outbound call
router.post("/click-to-call", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { lead_id, customer_phone } = req.body;
    const user = req.user;
    
    // Get agent's extension from user profile (you'll need to add this field)
    const agentExtension = user.tata_extension;
    
    if (!agentExtension) {
      return res.status(400).json({ detail: "Agent extension not configured" });
    }

    // Call Smartflo API
    const response = await axios.post(
      `${SMARTFLO_BASE_URL}/v1/click_to_call`,
      {
        agent_number: agentExtension,
        customer_number: customer_phone,
        reference_id: lead_id,
        record_call: true
      },
      {
        headers: {
          "Authorization": `Bearer ${SMARTFLO_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    // Log the call initiation
    const callRepository = AppDataSource.getRepository(Call);
    const call = callRepository.create({
      lead_id,
      user_id: user.id,
      direction: "outbound",
      status: "initiated",
      tata_call_id: response.data.call_id,
      phone_number: customer_phone
    });
    await callRepository.save(call);

    res.json({
      success: true,
      call_id: response.data.call_id,
      message: "Call initiated"
    });

  } catch (error) {
    console.error("Click to call error:", error.response?.data || error.message);
    res.status(500).json({ 
      detail: error.response?.data?.message || "Failed to initiate call" 
    });
  }
});

// Webhook handler for Tata Smartflo events
router.post("/webhook", async (req, res: Response) => {
  try {
    // Verify signature
    const signature = req.headers["x-smartflo-signature"] as string;
    const payload = JSON.stringify(req.body);
    
    if (WEBHOOK_SECRET && signature) {
      const isValid = verifyWebhookSignature(payload, signature, WEBHOOK_SECRET);
      if (!isValid) {
        console.warn("Invalid webhook signature");
        return res.status(403).json({ detail: "Invalid signature" });
      }
    }

    const { event, data } = req.body;
    const callRepository = AppDataSource.getRepository(Call);

    switch (event) {
      case "call.started":
        // Update call status
        await callRepository.update(
          { tata_call_id: data.call_id },
          { status: "ringing", started_at: new Date(data.timestamp) }
        );
        break;

      case "call.answered":
        await callRepository.update(
          { tata_call_id: data.call_id },
          { status: "in_progress", answered_at: new Date(data.timestamp) }
        );
        break;

      case "call.ended":
        await callRepository.update(
          { tata_call_id: data.call_id },
          {
            status: data.status === "answered" ? "completed" : "missed",
            ended_at: new Date(data.timestamp),
            duration: data.duration,
            recording_url: data.recording_url
          }
        );
        
        // Update lead's last_activity
        const call = await callRepository.findOne({ 
          where: { tata_call_id: data.call_id } 
        });
        if (call?.lead_id) {
          const leadRepository = AppDataSource.getRepository(Lead);
          await leadRepository.update(
            { id: call.lead_id },
            { last_activity: new Date(), attempt_count: () => "attempt_count + 1" }
          );
        }
        break;

      case "call.missed":
        await callRepository.update(
          { tata_call_id: data.call_id },
          { status: "missed", ended_at: new Date(data.timestamp) }
        );
        break;
    }

    res.json({ received: true });

  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).json({ detail: "Webhook processing failed" });
  }
});

// Get call history for a lead
router.get("/calls/:lead_id", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { lead_id } = req.params;
    const callRepository = AppDataSource.getRepository(Call);
    
    const calls = await callRepository.find({
      where: { lead_id },
      order: { created_at: "DESC" },
      take: 50
    });

    res.json(calls);

  } catch (error) {
    console.error("Get calls error:", error);
    res.status(500).json({ detail: "Failed to fetch calls" });
  }
});

// Helper function
function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = "sha256=" + crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

export default router;
```

### Step 2: Register Routes

Add to `/app/backend/src/index.ts`:

```typescript
import tataRoutes from "./routes/tata";
// ...
app.use("/api/tata", tataRoutes);
```

### Step 3: Update Call Entity

Modify `/app/backend/src/entities/Call.ts` to add Tata-specific fields:

```typescript
// Add these columns to the Call entity

@Column({ type: "varchar", length: 100, nullable: true })
tata_call_id: string;

@Column({ type: "varchar", length: 500, nullable: true })
recording_url: string;

@Column({ type: "datetime", nullable: true })
started_at: Date;

@Column({ type: "datetime", nullable: true })
answered_at: Date;

@Column({ type: "datetime", nullable: true })
ended_at: Date;

@Column({ type: "varchar", length: 20, nullable: true })
direction: "inbound" | "outbound";

@Column({ type: "varchar", length: 20, nullable: true })
status: "initiated" | "ringing" | "in_progress" | "completed" | "missed" | "failed";
```

### Step 4: Update User Entity

Add agent extension field to `/app/backend/src/entities/User.ts`:

```typescript
@Column({ type: "varchar", length: 20, nullable: true })
tata_extension: string;
```

---

## Database Schema Changes

### New Columns for `calls` Table

```sql
ALTER TABLE calls
ADD COLUMN tata_call_id VARCHAR(100) NULL,
ADD COLUMN recording_url VARCHAR(500) NULL,
ADD COLUMN started_at DATETIME NULL,
ADD COLUMN answered_at DATETIME NULL,
ADD COLUMN ended_at DATETIME NULL,
ADD COLUMN direction VARCHAR(20) NULL,
ADD COLUMN status VARCHAR(20) NULL;

CREATE INDEX idx_calls_tata_call_id ON calls(tata_call_id);
```

### New Column for `users` Table

```sql
ALTER TABLE users
ADD COLUMN tata_extension VARCHAR(20) NULL;
```

---

## Frontend Integration

### Click to Call Button Component

```tsx
// components/ClickToCallButton.tsx
import { useState } from 'react';
import { Phone, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';

interface ClickToCallButtonProps {
  leadId: string;
  phoneNumber: string;
  disabled?: boolean;
}

export function ClickToCallButton({ leadId, phoneNumber, disabled }: ClickToCallButtonProps) {
  const { api } = useAuth();
  const [calling, setCalling] = useState(false);

  const handleCall = async () => {
    if (!phoneNumber) {
      toast.error('No phone number available');
      return;
    }

    setCalling(true);
    try {
      const response = await api.post('/tata/click-to-call', {
        lead_id: leadId,
        customer_phone: phoneNumber
      });
      
      toast.success('Call initiated! Your phone will ring shortly.');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to initiate call');
    } finally {
      setCalling(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCall}
      disabled={disabled || calling || !phoneNumber}
      className="gap-2"
    >
      {calling ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Phone className="w-4 h-4" />
      )}
      {calling ? 'Calling...' : 'Call'}
    </Button>
  );
}
```

### Call History Component

```tsx
// components/CallHistory.tsx
import { useEffect, useState } from 'react';
import { Phone, PhoneIncoming, PhoneOutgoing, Play } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { formatDateTime, formatDuration } from '../lib/utils';

interface Call {
  id: string;
  direction: 'inbound' | 'outbound';
  status: string;
  duration: number;
  recording_url?: string;
  created_at: string;
}

export function CallHistory({ leadId }: { leadId: string }) {
  const { api } = useAuth();
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCalls();
  }, [leadId]);

  const fetchCalls = async () => {
    try {
      const response = await api.get(`/tata/calls/${leadId}`);
      setCalls(response.data);
    } catch (error) {
      console.error('Failed to fetch calls:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading calls...</div>;
  if (calls.length === 0) return <div className="text-muted-foreground">No call history</div>;

  return (
    <div className="space-y-2">
      {calls.map((call) => (
        <div key={call.id} className="flex items-center justify-between p-2 border rounded">
          <div className="flex items-center gap-2">
            {call.direction === 'inbound' ? (
              <PhoneIncoming className="w-4 h-4 text-blue-500" />
            ) : (
              <PhoneOutgoing className="w-4 h-4 text-green-500" />
            )}
            <div>
              <p className="text-sm font-medium">{call.direction === 'inbound' ? 'Incoming' : 'Outgoing'}</p>
              <p className="text-xs text-muted-foreground">{formatDateTime(call.created_at)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm">{formatDuration(call.duration)}</span>
            {call.recording_url && (
              <a href={call.recording_url} target="_blank" rel="noopener noreferrer">
                <Play className="w-4 h-4 text-primary" />
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

---

## Testing

### Test Checklist

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 1 | Click to Call - Success | Click call button on lead | Agent phone rings, then customer |
| 2 | Click to Call - No Extension | User without tata_extension clicks call | Error: "Agent extension not configured" |
| 3 | Webhook - Call Started | Smartflo sends call.started event | Call status updates to "ringing" |
| 4 | Webhook - Call Ended | Smartflo sends call.ended event | Duration and recording URL saved |
| 5 | Call History | View lead detail page | All calls listed with recordings |
| 6 | Invalid Webhook | Send request with wrong signature | 403 Forbidden response |

### API Testing with cURL

```bash
# Test Click to Call
curl -X POST "https://your-domain.com/api/tata/click-to-call" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "lead_id": "abc123",
    "customer_phone": "+919876543210"
  }'

# Test Webhook (simulated)
curl -X POST "https://your-domain.com/api/tata/webhook" \
  -H "Content-Type: application/json" \
  -H "x-smartflo-signature: sha256=YOUR_SIGNATURE" \
  -d '{
    "event": "call.ended",
    "data": {
      "call_id": "test-123",
      "duration": 120,
      "status": "answered"
    }
  }'
```

---

## Go-Live Checklist

### Pre-Launch

- [ ] Smartflo API key obtained and tested
- [ ] Webhook URL registered in Smartflo dashboard
- [ ] All agent extensions mapped to CRM users
- [ ] Database migrations applied
- [ ] SSL certificate valid (webhooks require HTTPS)
- [ ] Backend routes deployed and tested
- [ ] Frontend components integrated
- [ ] Call recording storage reviewed (compliance)

### Post-Launch

- [ ] Monitor webhook delivery success rate
- [ ] Verify call logs are being created
- [ ] Check recording URLs are accessible
- [ ] Review call duration accuracy
- [ ] Test inbound call routing

---

## Support & Contacts

### Tata Smartflo
- **Documentation**: https://docs.smartflo.tatatelebusiness.com
- **Support Portal**: https://support.tatatelebusiness.com
- **API Status**: https://status.smartflo.tatatelebusiness.com

### Internal
- **Backend Owner**: [Your Backend Dev]
- **Frontend Owner**: [Your Frontend Dev]
- **DevOps Contact**: [Your DevOps]

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Dec 2025 | Bidinn Team | Initial document |

---

*Document prepared for Bidinn CRM - Tata Smartflo Integration*

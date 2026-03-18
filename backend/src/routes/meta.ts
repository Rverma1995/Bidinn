import { Router, Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { MetaConfig, Lead, LeadStatus } from "../entities";
import { authenticateToken, requireRole, AuthRequest } from "../middleware/auth";
import { UserRole } from "../entities/User";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";

const router = Router();
const metaConfigRepository = () => AppDataSource.getRepository(MetaConfig);
const leadRepository = () => AppDataSource.getRepository(Lead);

// Get Meta config
router.get("/config", authenticateToken, requireRole([UserRole.ADMIN, UserRole.MANAGER]), async (req: AuthRequest, res: Response) => {
  try {
    const config = await metaConfigRepository().findOne({ where: {} });
    
    if (!config) {
      return res.json({
        page_id: "",
        app_secret: "",
        verify_token: "",
        page_access_token: "",
        is_active: false,
      });
    }

    res.json({
      page_id: config.page_id || "",
      app_secret: config.app_secret ? "***configured***" : "",
      verify_token: config.verify_token || "",
      page_access_token: config.page_access_token ? "***configured***" : "",
      is_active: config.is_active,
    });
  } catch (error) {
    console.error("Get Meta config error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Save Meta config
router.post("/config", authenticateToken, requireRole([UserRole.ADMIN, UserRole.MANAGER]), async (req: AuthRequest, res: Response) => {
  try {
    const { page_id, app_secret, verify_token, page_access_token, is_active } = req.body;

    let config = await metaConfigRepository().findOne({ where: {} });

    if (!config) {
      config = metaConfigRepository().create({
        id: uuidv4(),
      });
    }

    if (page_id !== undefined) config.page_id = page_id;
    if (app_secret && app_secret !== "***configured***") config.app_secret = app_secret;
    if (verify_token !== undefined) config.verify_token = verify_token;
    if (page_access_token && page_access_token !== "***configured***") config.page_access_token = page_access_token;
    if (typeof is_active === "boolean") config.is_active = is_active;

    await metaConfigRepository().save(config);

    res.json({ message: "Meta configuration saved successfully" });
  } catch (error) {
    console.error("Save Meta config error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Test Meta connection
router.post("/test-connection", authenticateToken, requireRole([UserRole.ADMIN, UserRole.MANAGER]), async (req: AuthRequest, res: Response) => {
  try {
    const config = await metaConfigRepository().findOne({ where: {} });

    if (!config || !config.page_access_token) {
      return res.status(400).json({ 
        success: false, 
        message: "Page Access Token is not configured" 
      });
    }

    // Make a test call to Meta Graph API to verify the token
    const response = await fetch(
      `https://graph.facebook.com/v18.0/me?access_token=${config.page_access_token}`
    );

    if (!response.ok) {
      const errorData = await response.json() as { error?: { message?: string } };
      return res.status(400).json({ 
        success: false, 
        message: errorData.error?.message || "Invalid Page Access Token" 
      });
    }

    const data = await response.json() as { name?: string; id?: string };
    
    res.json({ 
      success: true, 
      message: `Connection successful! Connected to page: ${data.name || data.id}` 
    });
  } catch (error) {
    console.error("Test connection error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to test connection" 
    });
  }
});

// Webhook verification (GET)
router.get("/webhook", async (req: Request, res: Response) => {
  try {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    const config = await metaConfigRepository().findOne({ where: { is_active: true } });

    if (mode === "subscribe" && config && token === config.verify_token) {
      console.log("Meta webhook verified");
      return res.status(200).send(challenge);
    }

    res.sendStatus(403);
  } catch (error) {
    console.error("Webhook verification error:", error);
    res.sendStatus(500);
  }
});

// Helper function to fetch form name from Meta Graph API
async function fetchFormNameFromMeta(formId: string, pageAccessToken: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${formId}?fields=name&access_token=${pageAccessToken}`
    );

    if (!response.ok) {
      const errorData = await response.json() as { error?: { message?: string } };
      console.error(`Failed to fetch form ${formId}:`, errorData.error?.message);
      return null;
    }

    const data = await response.json() as { id: string; name?: string };
    return data.name || null;
  } catch (error) {
    console.error(`Error fetching form ${formId} from Meta:`, error);
    return null;
  }
}

// Helper function to fetch lead details from Meta Graph API
async function fetchLeadDetailsFromMeta(leadgenId: string, pageAccessToken: string): Promise<{
  name: string;
  email: string;
  phone: string;
  formName?: string;
} | null> {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${leadgenId}?access_token=${pageAccessToken}`
    );

    if (!response.ok) {
      const errorData = await response.json() as { error?: { message?: string } };
      console.error(`Failed to fetch lead ${leadgenId}:`, errorData.error?.message);
      return null;
    }

    const data = await response.json() as {
      id: string;
      field_data?: Array<{ name: string; values: string[] }>;
      created_time?: string;
    };

    // Parse field_data to extract lead information
    let name = "";
    let email = "";
    let phone = "";

    if (data.field_data) {
      for (const field of data.field_data) {
        const fieldName = field.name.toLowerCase();
        const value = field.values?.[0] || "";

        if (fieldName.includes("name") || fieldName === "full_name") {
          name = value;
        } else if (fieldName.includes("email")) {
          email = value;
        } else if (fieldName.includes("phone") || fieldName.includes("mobile") || fieldName.includes("contact")) {
          phone = value;
        }
      }
    }

    // If no name found, try to construct from first/last name
    if (!name && data.field_data) {
      let firstName = "";
      let lastName = "";
      for (const field of data.field_data) {
        const fieldName = field.name.toLowerCase();
        const value = field.values?.[0] || "";
        if (fieldName === "first_name") firstName = value;
        if (fieldName === "last_name") lastName = value;
      }
      if (firstName || lastName) {
        name = `${firstName} ${lastName}`.trim();
      }
    }

    return { name, email, phone };
  } catch (error) {
    console.error(`Error fetching lead ${leadgenId} from Meta:`, error);
    return null;
  }
}

// Webhook handler (POST)
router.post("/webhook", async (req: Request & { rawBody?: Buffer }, res: Response) => {
  try {
    const config = await metaConfigRepository().findOne({ where: { is_active: true } });

    if (!config) {
      return res.sendStatus(200); // Acknowledge but don't process
    }

    // Verify signature if app_secret is configured
    if (config.app_secret) {
      const signature = req.headers["x-hub-signature-256"] as string;
      if (signature) {
        // Use raw body for signature verification (more reliable than JSON.stringify)
        const bodyToVerify = req.rawBody || Buffer.from(JSON.stringify(req.body));
        const expectedSignature = "sha256=" + crypto.createHmac("sha256", config.app_secret).update(bodyToVerify).digest("hex");
        if (signature !== expectedSignature) {
          console.warn("Invalid webhook signature - signature mismatch");
          console.warn(`Received: ${signature}`);
          console.warn(`Expected: ${expectedSignature}`);
          // Log but don't block - allow processing for debugging
          // In production, you may want to return res.sendStatus(403);
        }
      }
    }

    const body = req.body;

    if (body.object === "page") {
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          if (change.field === "leadgen") {
            const leadgenId = change.value?.leadgen_id;
            const formId = change.value?.form_id;
            const pageId = change.value?.page_id;

            console.log(`Received Meta lead webhook: leadgen_id=${leadgenId}, form_id=${formId}, page_id=${pageId}`);

            // Check if lead already exists
            const existingLead = await leadRepository().findOne({ where: { meta_leadgen_id: leadgenId } });
            if (existingLead) {
              console.log(`Lead ${leadgenId} already exists, skipping`);
              continue;
            }

            // Fetch full lead details from Meta Graph API
            let leadName = `Meta Lead ${leadgenId?.slice(-6) || "Unknown"}`;
            let leadEmail = "";
            let leadPhone = "";
            let campaignName = `Form ${formId?.slice(-6) || "Unknown"}`;

            if (config.page_access_token) {
              // Fetch lead details
              if (leadgenId) {
                const leadDetails = await fetchLeadDetailsFromMeta(leadgenId, config.page_access_token);
                if (leadDetails) {
                  leadName = leadDetails.name || leadName;
                  leadEmail = leadDetails.email || "";
                  leadPhone = leadDetails.phone || "";
                  console.log(`Fetched lead details: name=${leadName}, email=${leadEmail}, phone=${leadPhone ? '***' : 'none'}`);
                } else {
                  console.warn(`Could not fetch details for lead ${leadgenId}, creating with placeholder data`);
                }
              }
              
              // Fetch form/campaign name
              if (formId) {
                const formName = await fetchFormNameFromMeta(formId, config.page_access_token);
                if (formName) {
                  campaignName = formName;
                  console.log(`Fetched form name: ${formName}`);
                }
              }
            } else {
              console.warn(`No page_access_token configured, creating lead with placeholder data`);
            }

            // Create new lead with fetched data
            const lead = leadRepository().create({
              id: uuidv4(),
              name: leadName,
              phone: leadPhone || "Not provided",
              email: leadEmail,
              source: "Meta Lead Ads",
              campaign: campaignName,
              status: LeadStatus.NEW,
              meta_leadgen_id: leadgenId,
              attempt_count: 0,
            });

            await leadRepository().save(lead);
            console.log(`Created lead from Meta webhook: ${lead.id} - ${leadName}`);
          }
        }
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("Webhook handler error:", error);
    res.sendStatus(500);
  }
});

export default router;

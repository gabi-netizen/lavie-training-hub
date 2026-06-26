import { env } from "process";

let cachedApiKey: string | null = null;
let apiKeyExpiresAt: number = 0;

/**
 * Authenticates with Mintsoft API and returns the API key.
 * Caches the key for 30 minutes.
 */
async function getMintsoftApiKey(): Promise<string> {
  const now = Date.now();
  if (cachedApiKey && now < apiKeyExpiresAt) {
    return cachedApiKey;
  }

  const username = env.MINTSOFT_USERNAME;
  const password = env.MINTSOFT_PASSWORD;

  if (!username || !password) {
    throw new Error("MINTSOFT_USERNAME or MINTSOFT_PASSWORD environment variables are missing.");
  }

  const response = await fetch("https://api.mintsoft.co.uk/api/Auth", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      UserName: username,
      Password: password,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Mintsoft authentication failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  // The API returns a plain string surrounded by quotes, e.g., "YOUR_API_KEY"
  const keyWithQuotes = await response.text();
  const apiKey = keyWithQuotes.replace(/^"|"$/g, ""); // Remove surrounding quotes

  cachedApiKey = apiKey;
  // Cache for 30 minutes (30 * 60 * 1000 ms)
  apiKeyExpiresAt = now + 30 * 60 * 1000;

  return apiKey;
}

export interface MintsoftOrder {
  ID: number;
  OrderNumber: string;
  OrderDate: string;
  DespatchDate: string | null;
  OrderStatusId: number;
  CourierName: string | null;
  CourierServiceName: string | null;
  TrackingNumber: string | null;
  TrackingUrl: string | null;
  NumberOfItems: number;
  OrderValue: number;
  Items: Array<{
    SKU: string;
    Quantity: number;
    Price: number;
  }>;
  [key: string]: any; // Allow other fields
}

/**
 * Fetches the list of orders for a specific email address from Mintsoft.
 */
export async function getMintsoftOrders(email: string): Promise<MintsoftOrder[]> {
  const apiKey = await getMintsoftApiKey();

  const url = new URL("https://api.mintsoft.co.uk/api/Order/List");
  url.searchParams.append("APIKey", apiKey);
  url.searchParams.append("Email", email);
  url.searchParams.append("IncludeOrderItems", "true");
  url.searchParams.append("Limit", "50");

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Accept": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Mintsoft get orders failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  return data as MintsoftOrder[];
}

// ─── Trial Kit to SKU Mapping ─────────────────────────────────────────────────

interface OrderItem {
  SKU: string;
  Quantity: number;
  UnitPrice: number;
}

const SKU_PRICES: Record<string, number> = {
  "MAT20": 25.0,
  "S10": 25.0,
  "LM5": 25.0,
  "Leaflet-Starterkit": 1.0,
};

/**
 * Maps a trialKit value to the corresponding Mintsoft order items (SKUs).
 * Returns null if the trialKit value is not recognized.
 */
export function getOrderItemsForTrialKit(trialKit: string): OrderItem[] | null {
  const normalized = trialKit.trim();

  // Mapping: trialKit value → array of SKU codes
  const kitToSkus: Record<string, string[]> = {
    "Matinika + Oulala": ["MAT20", "S10", "Leaflet-Starterkit"],
    "Matinika + Ashkara": ["MAT20", "LM5", "Leaflet-Starterkit"],
    "Starter Kit Oulala": ["MAT20", "S10", "Leaflet-Starterkit"],
    "Starter Kit Ashkara": ["MAT20", "LM5", "Leaflet-Starterkit"],
  };

  const skus = kitToSkus[normalized];
  if (!skus) return null;

  return skus.map((sku) => ({
    SKU: sku,
    Quantity: 1,
    UnitPrice: SKU_PRICES[sku] ?? 0,
  }));
}

// ─── Address Parsing ──────────────────────────────────────────────────────────

export interface ParsedAddress {
  Address1: string;
  Town: string;
  County: string;
  PostCode: string;
}

/**
 * Parses a single-line UK address string into structured components.
 *
 * Expected format: "12 Queen Street, Cwmdare, Aberdare, Mid Glamorgan, CF44 8TT"
 *
 * Logic:
 * - PostCode: last comma-separated part matching UK postcode regex
 * - Address1: first comma-separated part
 * - Town: second part (or third if 4+ parts excluding postcode)
 * - County: part immediately before postcode (if exists)
 */
export function parseUkAddress(address: string): ParsedAddress {
  const UK_POSTCODE_REGEX = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;

  const parts = address.split(",").map((p) => p.trim()).filter((p) => p.length > 0);

  let postCode = "";
  let addressParts = [...parts];

  // Extract postcode: check from the end for a matching UK postcode
  for (let i = parts.length - 1; i >= 0; i--) {
    if (UK_POSTCODE_REGEX.test(parts[i])) {
      postCode = parts[i].toUpperCase();
      addressParts.splice(i, 1);
      break;
    }
  }

  // If no postcode found in its own comma-part, check if it's appended to the last part
  if (!postCode && parts.length > 0) {
    const lastPart = parts[parts.length - 1];
    const postcodeMatch = lastPart.match(/([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\s*$/i);
    if (postcodeMatch) {
      postCode = postcodeMatch[1].toUpperCase();
      const remaining = lastPart.slice(0, lastPart.length - postcodeMatch[0].length).trim();
      addressParts[addressParts.length - 1] = remaining;
      if (!addressParts[addressParts.length - 1]) {
        addressParts.pop();
      }
    }
  }

  const address1 = addressParts[0] || "";
  let town = "";
  let county = "";

  if (addressParts.length >= 4) {
    // Many parts: Address1, locality, Town, County
    town = addressParts[2] || "";
    county = addressParts[addressParts.length - 1] || "";
  } else if (addressParts.length === 3) {
    // Address1, Town, County
    town = addressParts[1] || "";
    county = addressParts[2] || "";
  } else if (addressParts.length === 2) {
    // Address1, Town (no county)
    town = addressParts[1] || "";
  }

  return { Address1: address1, Town: town, County: county, PostCode: postCode };
}

// ─── Create Mintsoft Order ────────────────────────────────────────────────────

export interface CreateMintsoftOrderParams {
  contactId: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  trialKit: string;
}

export interface CreateMintsoftOrderResult {
  success: boolean;
  orderId?: number;
  orderNumber?: string;
  error?: string;
}

/**
 * Creates a new order in Mintsoft for a trial kit shipment.
 *
 * Uses PUT /api/Order with the NewOrderWithItems schema.
 */
export async function createMintsoftOrder(params: CreateMintsoftOrderParams): Promise<CreateMintsoftOrderResult> {
  const { contactId, firstName, lastName, email, phone, address, trialKit } = params;

  // Get order items from trial kit mapping
  const orderItems = getOrderItemsForTrialKit(trialKit);
  if (!orderItems) {
    return {
      success: false,
      error: `Unrecognized trialKit value: "${trialKit}"`,
    };
  }

  // Parse the address
  const parsed = parseUkAddress(address);

  // Generate unique order number
  const timestamp = Date.now();
  const orderNumber = `LAVIE-${contactId}-${timestamp}`;

  // Authenticate
  const apiKey = await getMintsoftApiKey();

  // Build the order payload
  const orderPayload = {
    OrderNumber: orderNumber,
    FirstName: firstName,
    LastName: lastName,
    Email: email,
    Phone: phone,
    Address1: parsed.Address1,
    Town: parsed.Town,
    County: parsed.County,
    PostCode: parsed.PostCode,
    CountryId: 1, // UK
    WarehouseId: 3, // HAY
    CourierServiceId: 17, // Royal Mail Tracked 48 & Signed
    CurrencyId: 1, // GBP
    OrderValue: 4.95,
    OrderItems: orderItems.map((item) => ({
      SKU: item.SKU,
      Quantity: item.Quantity,
      UnitPrice: item.UnitPrice,
    })),
  };

  const url = `https://api.mintsoft.co.uk/api/Order?APIKey=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(orderPayload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return {
      success: false,
      error: `Mintsoft order creation failed: ${response.status} ${response.statusText} - ${errorText}`,
    };
  }

  const data = await response.json();

  // Mintsoft returns the created order object with an ID
  const orderId = data?.ID ?? data?.id ?? null;

  return {
    success: true,
    orderId: orderId,
    orderNumber: orderNumber,
  };
}

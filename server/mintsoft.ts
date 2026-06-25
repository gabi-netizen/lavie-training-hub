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

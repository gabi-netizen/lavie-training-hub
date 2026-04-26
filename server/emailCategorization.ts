/**
 * Email Categorization Engine — Rule-Based (NO AI)
 *
 * Pure keyword/pattern matching on incoming emails.
 * Determines category, priority, and customer status.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export const TICKET_CATEGORIES = [
  "cancellation_request",
  "shipping_delivery_issue",
  "payment_billing_dispute",
  "address_update",
  "product_feedback",
  "agent_forwarded",
  "system_automated",
  "follow_up_unanswered",
  "subscription_question",
  "general_inquiry",
] as const;

export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const TICKET_PRIORITIES = ["HIGH", "MEDIUM", "LOW"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const CUSTOMER_STATUSES = ["existing", "new", "internal", "system"] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export const TICKET_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

// ─── Category Detection Rules ────────────────────────────────────────────────

interface CategoryRule {
  category: TicketCategory;
  priority: TicketPriority;
  /** Keywords to match in subject + body (case-insensitive) */
  keywords?: string[];
  /** Check if the sender email matches a pattern */
  fromPatterns?: string[];
  /** Check if subject matches a pattern */
  subjectPatterns?: string[];
}

const CATEGORY_RULES: CategoryRule[] = [
  // System/Automated — check first to filter out noise
  {
    category: "system_automated",
    priority: "LOW",
    fromPatterns: ["noreply", "no-reply", "zoho", "billing@", "notification", "mailer-daemon", "postmaster"],
  },
  // Agent Forwarded — from internal team
  {
    category: "agent_forwarded",
    priority: "MEDIUM",
    fromPatterns: ["@lavielabs.com"],
    subjectPatterns: ["fwd:", "fw:"],
  },
  // Cancellation Request
  {
    category: "cancellation_request",
    priority: "HIGH",
    keywords: [
      "cancel",
      "cancellation",
      "stop subscription",
      "no further payments",
      "unsubscribe",
      "cancel my",
      "want to cancel",
      "please cancel",
      "stop my subscription",
      "end my subscription",
      "terminate",
    ],
  },
  // Follow-up/Unanswered — check before general to catch urgency
  {
    category: "follow_up_unanswered",
    priority: "HIGH",
    keywords: [
      "no response",
      "didn't hear back",
      "didn't hear back",
      "following up",
      "unanswered",
      "still waiting",
      "haven't heard",
      "havent heard",
      "no reply",
      "chasing up",
      "sent an email previously",
      "emailed before",
    ],
  },
  // Shipping/Delivery Issue
  {
    category: "shipping_delivery_issue",
    priority: "HIGH",
    keywords: [
      "not received",
      "not arrived",
      "delivery",
      "dhl",
      "tracking",
      "missing package",
      "where is my order",
      "shipment",
      "parcel",
      "hasn't arrived",
      "hasnt arrived",
      "dispatch",
      "courier",
      "royal mail",
    ],
  },
  // Payment/Billing Dispute
  {
    category: "payment_billing_dispute",
    priority: "HIGH",
    keywords: [
      "charge",
      "payment",
      "refund",
      "invoice",
      "instalment",
      "installment",
      "bank",
      "unauthorized",
      "unauthorised",
      "direct debit",
      "money taken",
      "overcharged",
      "billing",
      "charged me",
      "took money",
      "unexpected charge",
    ],
  },
  // Address Update
  {
    category: "address_update",
    priority: "MEDIUM",
    keywords: [
      "address",
      "moved",
      "new address",
      "current address",
      "change my address",
      "update my address",
      "delivery address",
      "wrong address",
      "postcode",
    ],
  },
  // Subscription Question
  {
    category: "subscription_question",
    priority: "MEDIUM",
    keywords: [
      "subscription",
      "commit",
      "optional",
      "trial",
      "how does it work",
      "how long",
      "contract",
      "minimum term",
      "sign up",
      "what do i get",
      "what is included",
    ],
  },
  // Product Feedback
  {
    category: "product_feedback",
    priority: "LOW",
    keywords: [
      "love",
      "feedback",
      "amazing",
      "great product",
      "thank you",
      "wonderful",
      "brilliant",
      "fantastic",
      "happy with",
      "pleased with",
      "recommend",
      "my experience",
      "skin looks",
      "made a difference",
    ],
  },
];

// ─── Category Labels & Colors (for frontend) ────────────────────────────────

export const CATEGORY_META: Record<
  TicketCategory,
  { label: string; color: string; bgColor: string; textColor: string }
> = {
  cancellation_request: {
    label: "Cancellation Request",
    color: "#ef4444",
    bgColor: "bg-red-100",
    textColor: "text-red-700",
  },
  shipping_delivery_issue: {
    label: "Shipping/Delivery Issue",
    color: "#f97316",
    bgColor: "bg-orange-100",
    textColor: "text-orange-700",
  },
  payment_billing_dispute: {
    label: "Payment/Billing Dispute",
    color: "#3b82f6",
    bgColor: "bg-blue-100",
    textColor: "text-blue-700",
  },
  address_update: {
    label: "Address Update",
    color: "#8b5cf6",
    bgColor: "bg-purple-100",
    textColor: "text-purple-700",
  },
  product_feedback: {
    label: "Product Feedback",
    color: "#10b981",
    bgColor: "bg-emerald-100",
    textColor: "text-emerald-700",
  },
  agent_forwarded: {
    label: "Agent Forwarded",
    color: "#6366f1",
    bgColor: "bg-indigo-100",
    textColor: "text-indigo-700",
  },
  system_automated: {
    label: "System/Automated",
    color: "#6b7280",
    bgColor: "bg-slate-100",
    textColor: "text-slate-600",
  },
  follow_up_unanswered: {
    label: "Follow-up/Unanswered",
    color: "#f59e0b",
    bgColor: "bg-amber-100",
    textColor: "text-amber-700",
  },
  subscription_question: {
    label: "Subscription Question",
    color: "#0ea5e9",
    bgColor: "bg-sky-100",
    textColor: "text-sky-700",
  },
  general_inquiry: {
    label: "General Inquiry",
    color: "#64748b",
    bgColor: "bg-slate-100",
    textColor: "text-slate-700",
  },
};

// ─── Categorization Function ─────────────────────────────────────────────────

export interface CategorizationResult {
  category: TicketCategory;
  priority: TicketPriority;
  customerStatus: CustomerStatus;
}

/**
 * Categorize an email based on keyword matching.
 * Returns the first matching category, or "general_inquiry" as fallback.
 */
export function categorizeEmail(params: {
  fromEmail: string;
  fromName?: string;
  subject?: string;
  bodyText?: string;
}): { category: TicketCategory; priority: TicketPriority } {
  const fromLower = (params.fromEmail || "").toLowerCase();
  const subjectLower = (params.subject || "").toLowerCase();
  const bodyLower = (params.bodyText || "").toLowerCase();
  const combinedText = `${subjectLower} ${bodyLower}`;

  for (const rule of CATEGORY_RULES) {
    // Check from patterns
    if (rule.fromPatterns) {
      const fromMatch = rule.fromPatterns.some((p) => fromLower.includes(p.toLowerCase()));
      if (fromMatch) {
        // For agent_forwarded, also need subject pattern OR from pattern alone
        if (rule.category === "agent_forwarded") {
          // If from @lavielabs.com, it's agent forwarded
          if (fromLower.includes("@lavielabs.com")) {
            return { category: rule.category, priority: rule.priority };
          }
          // If subject has Fwd: and from is internal, also match
          if (rule.subjectPatterns?.some((p) => subjectLower.includes(p.toLowerCase()))) {
            return { category: rule.category, priority: rule.priority };
          }
          // Don't match on subject pattern alone — continue checking other rules
          continue;
        }
        return { category: rule.category, priority: rule.priority };
      }
    }

    // Check subject patterns (for agent_forwarded with Fwd: from internal)
    if (rule.subjectPatterns && !rule.fromPatterns) {
      const subjectMatch = rule.subjectPatterns.some((p) =>
        subjectLower.includes(p.toLowerCase())
      );
      if (subjectMatch) {
        return { category: rule.category, priority: rule.priority };
      }
    }

    // Check keywords in combined text
    if (rule.keywords) {
      const keywordMatch = rule.keywords.some((kw) =>
        combinedText.includes(kw.toLowerCase())
      );
      if (keywordMatch) {
        return { category: rule.category, priority: rule.priority };
      }
    }
  }

  // Default: General Inquiry
  return { category: "general_inquiry", priority: "MEDIUM" };
}

/**
 * Determine customer status based on email address.
 * For now: checks if sender is internal (@lavielabs.com) or system (noreply etc.)
 * Later: will add Zoho/Stripe lookups.
 */
export function determineCustomerStatus(
  fromEmail: string,
  hasExistingEmails: boolean
): CustomerStatus {
  const emailLower = fromEmail.toLowerCase();

  // Internal team
  if (emailLower.includes("@lavielabs.com")) {
    return "internal";
  }

  // System / automated senders
  const systemPatterns = [
    "noreply",
    "no-reply",
    "zoho",
    "billing@",
    "notification",
    "mailer-daemon",
    "postmaster",
    "support@zohobilling",
  ];
  if (systemPatterns.some((p) => emailLower.includes(p))) {
    return "system";
  }

  // Check if we've seen this email before
  if (hasExistingEmails) {
    return "existing";
  }

  return "new";
}

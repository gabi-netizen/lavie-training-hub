import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { authenticateClerkRequest } from "./clerkAuth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  /** If a disabled user tries to authenticate, store the error message here */
  disabledMessage?: string;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let disabledMessage: string | undefined;

  try {
    user = await authenticateClerkRequest(opts.req);
  } catch (error) {
    // Check if this is a disabled-user error
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("has been disabled")) {
      disabledMessage = msg;
    }
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    disabledMessage,
  };
}

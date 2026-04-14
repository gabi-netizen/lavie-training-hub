import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { formSubmissions } from "../../drizzle/schema";
import { notifyOwner } from "../_core/notification";

export const paymentFormRouter = router({
  submit: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        cardholderName: z.string().min(1),
        cardLast4: z.string().length(4).optional(),
        cardExpiry: z.string().optional(),
        addressLine1: z.string().optional(),
        addressLine2: z.string().optional(),
        city: z.string().optional(),
        postcode: z.string().optional(),
        agentName: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.insert(formSubmissions).values({
        email: input.email,
        cardholderName: input.cardholderName,
        cardLast4: input.cardLast4,
        cardExpiry: input.cardExpiry,
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2,
        city: input.city,
        postcode: input.postcode,
        agentName: input.agentName,
        status: "new",
      });

      // Notify owner
      await notifyOwner({
        title: "New Payment Form Submission",
        content: `Customer: ${input.cardholderName} (${input.email})\nCard ending: ${input.cardLast4 ?? "N/A"}\nExpiry: ${input.cardExpiry ?? "N/A"}\nAddress: ${[input.addressLine1, input.addressLine2, input.city, input.postcode].filter(Boolean).join(", ")}`,
      });

      return { success: true };
    }),
});

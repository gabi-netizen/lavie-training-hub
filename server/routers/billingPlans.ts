/**
 * Billing Plans (Campaigns) tRPC Router
 *
 * Admin-only CRUD endpoints for managing billing plans / campaigns.
 * Each plan defines a series of phases (products, pricing, triggers)
 * that determine what happens at each billing cycle for a contact.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { billingPlans } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";

// ─── Phase Schema ────────────────────────────────────────────────────────────
const phaseSchema = z.object({
  phase: z.number(),
  productName: z.string(),
  sku: z.string().optional().default(""),
  price: z.number(),
  currency: z.string().optional().default("GBP"),
  triggerType: z.enum(["immediate", "days_after_start", "recurring"]),
  triggerDays: z.number().default(0),
  mintsoftItems: z.array(
    z.object({
      SKU: z.string(),
      Quantity: z.number(),
    })
  ).optional().default([]),
});

export const billingPlansRouter = router({
  /**
   * list — get all active billing plans
   */
  list: adminProcedure
    .input(z.object({}).optional())
    .query(async () => {
      const db = await getDb();
      if (!db) return [];

      const plans = await db
        .select()
        .from(billingPlans)
        .where(eq(billingPlans.isActive, true))
        .orderBy(desc(billingPlans.createdAt));

      return plans;
    }),

  /**
   * listAll — get all plans including inactive (for admin view)
   */
  listAll: adminProcedure
    .input(z.object({}).optional())
    .query(async () => {
      const db = await getDb();
      if (!db) return [];

      const plans = await db
        .select()
        .from(billingPlans)
        .orderBy(desc(billingPlans.createdAt));

      return plans;
    }),

  /**
   * get — get a single plan by ID
   */
  get: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [plan] = await db
        .select()
        .from(billingPlans)
        .where(eq(billingPlans.id, input.id))
        .limit(1);

      if (!plan) throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found" });
      return plan;
    }),

  /**
   * create — create a new billing plan
   */
  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1, "Name is required"),
        type: z.enum(["subscription", "installment", "one_time"]),
        phases: z.array(phaseSchema).min(1, "At least one phase is required"),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [result] = await db.insert(billingPlans).values({
        name: input.name,
        type: input.type,
        phases: input.phases,
        isActive: true,
      });

      return { id: result.insertId, success: true };
    }),

  /**
   * update — update an existing billing plan
   */
  update: adminProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        type: z.enum(["subscription", "installment", "one_time"]).optional(),
        phases: z.array(phaseSchema).optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const { id, ...updates } = input;

      // Verify plan exists
      const [existing] = await db
        .select()
        .from(billingPlans)
        .where(eq(billingPlans.id, id))
        .limit(1);

      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found" });

      const setData: Record<string, any> = {};
      if (updates.name !== undefined) setData.name = updates.name;
      if (updates.type !== undefined) setData.type = updates.type;
      if (updates.phases !== undefined) setData.phases = updates.phases;
      if (updates.isActive !== undefined) setData.isActive = updates.isActive;

      if (Object.keys(setData).length > 0) {
        await db.update(billingPlans).set(setData).where(eq(billingPlans.id, id));
      }

      return { success: true };
    }),

  /**
   * delete — soft delete (set isActive = false)
   */
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [existing] = await db
        .select()
        .from(billingPlans)
        .where(eq(billingPlans.id, input.id))
        .limit(1);

      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found" });

      await db
        .update(billingPlans)
        .set({ isActive: false })
        .where(eq(billingPlans.id, input.id));

      return { success: true };
    }),
});

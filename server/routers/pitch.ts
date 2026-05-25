import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import {
  deletePitchCustomization,
  getAllPitchCustomizationsOverview,
  getDb,
  getUserPitchCustomizations,
  upsertPitchCustomization,
} from "../db";
import { users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const pitchRouter = router({
  myCustomizations: protectedProcedure.query(async ({ ctx }) => {
    return getUserPitchCustomizations(ctx.user.id);
  }),

  upsert: protectedProcedure
    .input(
      z.object({
        stageNum: z.number(),
        customContent: z.record(z.string(), z.unknown()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await upsertPitchCustomization(ctx.user.id, input.stageNum, input.customContent);
      return { success: true };
    }),

  reset: protectedProcedure
    .input(z.object({ stageNum: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deletePitchCustomization(ctx.user.id, input.stageNum);
      return { success: true };
    }),

  allUsers: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select({ id: users.id, name: users.name, email: users.email, role: users.role, team: users.team })
      .from(users)
      .where(eq(users.active, true));
  }),

  agentsOverview: protectedProcedure.query(async () => {
    return getAllPitchCustomizationsOverview();
  }),

  agentCustomizations: protectedProcedure
    .input(z.object({ agentUserId: z.number() }))
    .query(async ({ input }) => {
      return getUserPitchCustomizations(input.agentUserId);
    }),

  adminUpsert: adminProcedure
    .input(
      z.object({
        agentUserId: z.number(),
        stageNum: z.number(),
        customContent: z.record(z.string(), z.unknown()),
      })
    )
    .mutation(async ({ input }) => {
      await upsertPitchCustomization(input.agentUserId, input.stageNum, input.customContent);
      return { success: true };
    }),

  adminReset: adminProcedure
    .input(z.object({ agentUserId: z.number(), stageNum: z.number() }))
    .mutation(async ({ input }) => {
      await deletePitchCustomization(input.agentUserId, input.stageNum);
      return { success: true };
    }),
});

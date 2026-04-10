import { z } from "zod";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "../_core/trpc";
import {
  createCallAnalysisRecord,
  getCallAnalysisById,
  listCallAnalysesByUser,
  listAllCallAnalyses,
  processCallAnalysis,
  getLeaderboard,
} from "../callAnalysis";

export const callCoachRouter = router({
  getMyAnalyses: protectedProcedure.query(async ({ ctx }) => {
    return listCallAnalysesByUser(ctx.user.id);
  }),

  getAnalysis: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const analysis = await getCallAnalysisById(input.id);
      if (!analysis) return null;
      if (ctx.user.role !== "admin" && analysis.userId !== ctx.user.id) {
        return null;
      }
      return analysis;
    }),

  getAllAnalyses: adminProcedure.query(async () => {
    return listAllCallAnalyses();
  }),

  /** Public leaderboard — visible to all logged-in users */
  getLeaderboard: protectedProcedure.query(async () => {
    return getLeaderboard();
  }),

  /**
   * Called by the frontend after a successful file upload.
   * Accepts metadata: repName, callDate, closeStatus.
   */
  startAnalysis: protectedProcedure
    .input(
      z.object({
        audioFileKey: z.string(),
        audioFileUrl: z.string(),
        fileName: z.string(),
        repName: z.string().optional(),
        callDate: z.string().optional(), // ISO date string
        closeStatus: z.enum(["closed", "not_closed", "follow_up"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const analysisId = await createCallAnalysisRecord({
        userId: ctx.user.id,
        repName: input.repName ?? ctx.user.name ?? null,
        audioFileKey: input.audioFileKey,
        audioFileUrl: input.audioFileUrl,
        fileName: input.fileName,
        callDate: input.callDate ? new Date(input.callDate) : null,
        closeStatus: input.closeStatus ?? null,
      });

      processCallAnalysis(analysisId, input.audioFileUrl).catch(err =>
        console.error("[callCoach] processCallAnalysis error:", err)
      );

      return { analysisId };
    }),
});

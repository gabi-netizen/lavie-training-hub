import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";
import {
  createCallAnalysisRecord,
  getCallAnalysisById,
  listCallAnalysesByUser,
  listAllCallAnalyses,
  processCallAnalysis,
} from "../callAnalysis";

export const callCoachRouter = router({
  /**
   * Get a signed upload URL — frontend POSTs audio bytes to /api/call-upload
   * This procedure creates the DB record and returns the analysis ID.
   * The actual upload happens via the /api/call-upload REST endpoint.
   */
  getMyAnalyses: protectedProcedure.query(async ({ ctx }) => {
    return listCallAnalysesByUser(ctx.user.id);
  }),

  getAnalysis: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const analysis = await getCallAnalysisById(input.id);
      if (!analysis) return null;
      // Reps can only see their own; admins can see all
      if (ctx.user.role !== "admin" && analysis.userId !== ctx.user.id) {
        return null;
      }
      return analysis;
    }),

  getAllAnalyses: adminProcedure.query(async () => {
    return listAllCallAnalyses();
  }),

  /**
   * Called by the frontend after a successful file upload.
   * Kicks off the async analysis pipeline.
   */
  startAnalysis: protectedProcedure
    .input(
      z.object({
        audioFileKey: z.string(),
        audioFileUrl: z.string(),
        fileName: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const analysisId = await createCallAnalysisRecord({
        userId: ctx.user.id,
        repName: ctx.user.name ?? null,
        audioFileKey: input.audioFileKey,
        audioFileUrl: input.audioFileUrl,
        fileName: input.fileName,
      });

      // Kick off async — don't await so the response is immediate
      processCallAnalysis(analysisId, input.audioFileUrl).catch(err =>
        console.error("[callCoach] processCallAnalysis error:", err)
      );

      return { analysisId };
    }),
});

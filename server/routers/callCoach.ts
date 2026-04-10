import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import {
  createCallAnalysisRecord,
  getCallAnalysisById,
  listCallAnalysesByUser,
  listAllCallAnalyses,
  processCallAnalysis,
  getLeaderboard,
  submitFeedback,
  getFeedbackSummary,
  updateCallDetails,
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

  /**
   * Update call metadata (repName, callDate, closeStatus) after upload.
   * Owner or admin can edit.
   */
  updateCallDetails: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        repName: z.string().optional(),
        callDate: z.string().optional(),
        closeStatus: z.enum(["closed", "not_closed", "follow_up"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const analysis = await getCallAnalysisById(input.id);
      if (!analysis) throw new Error("Not found");
      if (ctx.user.role !== "admin" && analysis.userId !== ctx.user.id) {
        throw new Error("Forbidden");
      }
      await updateCallDetails({
        id: input.id,
        repName: input.repName,
        callDate: input.callDate ? new Date(input.callDate) : undefined,
        closeStatus: input.closeStatus,
        lastEditedByUserId: ctx.user.id,
        lastEditedByName: ctx.user.name ?? ctx.user.email ?? `User #${ctx.user.id}`,
      });
      return { success: true };
    }),

  /**
   * Submit feedback flagging an inaccurate AI analysis section.
   * Any logged-in user (rep or manager) can submit.
   */
  submitFeedback: protectedProcedure
    .input(
      z.object({
        analysisId: z.number(),
        section: z.enum(["overall", "script_compliance", "tone", "talk_ratio", "recommendations", "transcript", "other"]),
        issue: z.string().min(1).max(512),
        comment: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await submitFeedback({
        analysisId: input.analysisId,
        userId: ctx.user.id,
        section: input.section,
        issue: input.issue,
        comment: input.comment ?? null,
      });
      return { success: true };
    }),

  /**
   * Admin-only: get all feedback submissions grouped by section,
   * useful for identifying patterns and improving the AI prompt.
   */
  getFeedbackSummary: adminProcedure.query(async () => {
    return getFeedbackSummary();
  }),
});

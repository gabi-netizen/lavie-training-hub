import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { callCoachRouter } from "./routers/callCoach";
import { contactsRouter } from "./routers/contacts";
import { phoneNumbersRouter } from "./routers/phoneNumbers";
import { emailTemplatesRouter } from "./routers/emailTemplates";
import { pitchRouter } from "./routers/pitch";
import { paymentFormRouter } from "./routers/paymentForm";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(() => {
      // Clerk handles session invalidation on the frontend via signOut().
      // This endpoint is kept for compatibility but does nothing server-side.
      return {
        success: true,
      } as const;
    }),
  }),

  callCoach: callCoachRouter,
  contacts: contactsRouter,
  phoneNumbers: phoneNumbersRouter,
  emailTemplates: emailTemplatesRouter,
  pitch: pitchRouter,
  paymentForm: paymentFormRouter,
});

export type AppRouter = typeof appRouter;

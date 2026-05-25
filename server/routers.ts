import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { callCoachRouter } from "./routers/callCoach";
import { contactsRouter } from "./routers/contacts";
import { phoneNumbersRouter } from "./routers/phoneNumbers";
import { emailTemplatesRouter } from "./routers/emailTemplates";
import { pitchRouter } from "./routers/pitch";
import { paymentFormRouter } from "./routers/paymentForm";
import { dashboardRouter } from "./routers/dashboard";
import { managerRouter } from "./routers/manager";
import { ticketsRouter } from "./routers/tickets";
import { openingDashboardRouter } from "./routers/openingDashboard";
import { usersRouter } from "./routers/users";
import { whatsappRouter } from "./routers/whatsapp";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => {
      // If user was disabled, throw a FORBIDDEN error so the frontend can display the message
      if (opts.ctx.disabledMessage) {
        throw new TRPCError({ code: "FORBIDDEN", message: opts.ctx.disabledMessage });
      }
      return opts.ctx.user;
    }),
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
  dashboard: dashboardRouter,
  manager: managerRouter,
  tickets: ticketsRouter,
  openingDashboard: openingDashboardRouter,
  users: usersRouter,
  whatsapp: whatsappRouter,
});

export type AppRouter = typeof appRouter;

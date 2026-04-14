import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { callCoachRouter } from "./routers/callCoach";
import { contactsRouter } from "./routers/contacts";
import { phoneNumbersRouter } from "./routers/phoneNumbers";
import { emailTemplatesRouter } from "./routers/emailTemplates";
import { pitchRouter } from "./routers/pitch";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
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
});

export type AppRouter = typeof appRouter;

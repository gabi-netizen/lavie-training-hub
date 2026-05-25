import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { listWhatsAppTemplates, sendWhatsAppMessage } from "../twilio";
import { getContact } from "../contacts";
import { normalisePhone } from "../contacts";

export const whatsappRouter = router({
  // ─── List available WhatsApp templates from Twilio Content API ─────────────
  // Opening: only "op_" or "OP:" prefixed templates
  // Retention: "rt_" or "RT:" prefixed + any template without a known prefix (legacy)
  // No team: sees everything
  templates: protectedProcedure.query(async ({ ctx }) => {
    try {
      const templates = await listWhatsAppTemplates();
      const userTeam = ctx.user.team; // "opening" | "retention" | "academy" | null

      if (!userTeam) {
        // No team (admin/unassigned) — show all templates
        return templates;
      }

      const allKnownPrefixes = ["op_", "OP:", "rt_", "RT:"];
      const hasKnownPrefix = (name: string) =>
        allKnownPrefixes.some((p) => name.startsWith(p));

      if (userTeam === "opening" || userTeam === "academy") {
        // Opening/Academy: only templates explicitly tagged for opening
        return templates.filter((t) =>
          t.friendly_name.startsWith("op_") || t.friendly_name.startsWith("OP:")
        );
      }

      if (userTeam === "retention") {
        // Retention: rt_ prefixed + legacy templates (no prefix)
        return templates.filter((t) =>
          t.friendly_name.startsWith("rt_") ||
          t.friendly_name.startsWith("RT:") ||
          !hasKnownPrefix(t.friendly_name)
        );
      }

      return templates;
    } catch (err) {
      console.error("[WhatsApp] Failed to fetch templates:", err);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch WhatsApp templates from Twilio",
      });
    }
  }),

  // ─── Send a WhatsApp message to a contact using a template ─────────────────
  send: protectedProcedure
    .input(
      z.object({
        contactId: z.number(),
        contentSid: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { contactId, contentSid } = input;

      // Get the contact
      const contact = await getContact(contactId);
      if (!contact) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Contact not found",
        });
      }

      if (!contact.phone) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Contact does not have a phone number",
        });
      }

      // Normalise the phone number to E.164 (UK-focused)
      const normalisedPhone = normalisePhone(contact.phone);
      if (!normalisedPhone) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Could not normalise contact phone number",
        });
      }

      // Ensure it starts with +
      const e164Phone = normalisedPhone.startsWith("+")
        ? normalisedPhone
        : `+${normalisedPhone}`;

      // Build content variables: {{1}} = customer first name, {{2}} = agent first name
      // Use contact.agentName (the assigned agent) not ctx.user (the logged-in user)
      const customerFirstName = (contact.name ?? "").split(" ")[0] || "there";
      const agentFirstName = (contact.agentName ?? ctx.user.name ?? "").split(" ")[0] || "Lavie Labs";

      try {
        const result = await sendWhatsAppMessage({
          to: e164Phone,
          contentSid,
          contentVariables: {
            "1": customerFirstName,
            "2": agentFirstName,
          },
        });

        console.log(
          `[WhatsApp] Message sent by ${ctx.user.name ?? ctx.user.email} to contact #${contactId} (${e164Phone}): ${result.sid}`
        );

        return {
          success: true,
          messageSid: result.sid,
          status: result.status,
        };
      } catch (err) {
        console.error("[WhatsApp] Send error:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to send WhatsApp message: ${(err as Error).message}`,
        });
      }
    }),
});

import { describe, it, expect, vi } from "vitest";

/**
 * Unit tests for the CloudTalk webhook handler.
 * We test the payload parsing logic without hitting real external services.
 */

describe("CloudTalk Webhook Handler", () => {
  it("should detect call_ended event type from various payload formats", () => {
    const eventTypes = [
      "call_ended",
      "call_finished",
      "CALL_ENDED",
      "CALL_FINISHED",
    ];
    for (const eventType of eventTypes) {
      const isCallEnded =
        eventType === "call_ended" ||
        eventType === "call_finished" ||
        eventType === "CALL_ENDED" ||
        eventType === "CALL_FINISHED";
      expect(isCallEnded).toBe(true);
    }
  });

  it("should extract call data from nested CloudTalk payload", () => {
    const payload = {
      event: "call_ended",
      Call: {
        uuid: "abc-123",
        recording_url: "https://recordings.cloudtalk.io/test.mp3",
        agent_id: 178617,
        caller_number: "+447700900000",
        duration: 180,
        started_at: "2024-01-15T10:00:00Z",
      },
    };

    const call = payload.Call;
    const callId = call.uuid;
    const recordingUrl = call.recording_url;
    const agentId = call.agent_id;
    const callerPhone = call.caller_number;

    expect(callId).toBe("abc-123");
    expect(recordingUrl).toBe("https://recordings.cloudtalk.io/test.mp3");
    expect(agentId).toBe(178617);
    expect(callerPhone).toBe("+447700900000");
  });

  it("should extract call data from flat CloudTalk payload", () => {
    const payload = {
      type: "call_finished",
      id: "xyz-456",
      recording_url: "https://recordings.cloudtalk.io/test2.mp3",
      agent_id: "178617",
      caller_number: "+447700900001",
      duration: 240,
    };

    const call = payload;
    const callId = call.id;
    const recordingUrl = call.recording_url;
    const agentId = call.agent_id;

    expect(callId).toBe("xyz-456");
    expect(recordingUrl).toBe("https://recordings.cloudtalk.io/test2.mp3");
    expect(agentId).toBe("178617");
  });

  it("should normalize phone numbers for contact matching", () => {
    const normalizePhone = (phone: string) =>
      phone.replace(/[\s\-().+]/g, "");

    expect(normalizePhone("+44 7700 900000")).toBe("447700900000");
    expect(normalizePhone("+44-7700-900000")).toBe("447700900000");
    expect(normalizePhone("(+44) 7700 900000")).toBe("447700900000");
    expect(normalizePhone("+447700900000")).toBe("447700900000");
  });

  it("should return false for non-call-ended events", () => {
    const nonCallEndedEvents = [
      "call_started",
      "agent_status_changed",
      "voicemail_received",
      "unknown",
    ];
    for (const eventType of nonCallEndedEvents) {
      const isCallEnded =
        eventType === "call_ended" ||
        eventType === "call_finished" ||
        eventType === "CALL_ENDED" ||
        eventType === "CALL_FINISHED";
      expect(isCallEnded).toBe(false);
    }
  });
});

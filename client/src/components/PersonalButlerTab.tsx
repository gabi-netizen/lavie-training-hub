import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Send, Sparkles } from "lucide-react";

interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  csvData?: string;
}

export function PersonalButlerTab() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const askButler = trpc.manager.askButler.useMutation();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  const handleSend = async () => {
    const question = input.trim();
    if (!question || isLoading) return;

    const userMsg: Message = {
      id: Date.now(),
      role: "user",
      content: question,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      // Send last 10 messages as history for context continuity
      const history = messages.slice(-10).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
      const result = await askButler.mutateAsync({ question, history });
      // Extract CSV data if present — show download button instead of auto-downloading
      let csvData: string | undefined;
      if (result.answer.includes("---CSV_START---") && result.answer.includes("---CSV_END---")) {
        const csvMatch = result.answer.match(/---CSV_START---\n([\s\S]*?)\n---CSV_END---/);
        if (csvMatch?.[1]) {
          csvData = csvMatch[1];
        }
      }
      const aiMsg: Message = {
        id: Date.now() + 1,
        role: "assistant",
        content: result.answer.replace(/\n---CSV_START---[\s\S]*?---CSV_END---\n/g, ""),
        timestamp: new Date(),
        csvData,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      const errorMsg: Message = {
        id: Date.now() + 1,
        role: "assistant",
        content: "Sorry, something went wrong. Please try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };



  const handleCsvDownload = (csvData: string) => {
    const blob = new Blob([csvData], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const today = new Date().toISOString().split("T")[0];
    a.download = `zoho-import-${today}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatContent = (content: string) => {
    // Format: bold (**text**), bullet points, newlines
    return content.split("\n").map((line, i) => {
      const formatted = line
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/^[-•]\s*/, "• ");
      return (
        <p
          key={i}
          className={`${line.trim() === "" ? "h-2" : "mb-1"} last:mb-0`}
          dangerouslySetInnerHTML={{ __html: formatted }}
        />
      );
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", background: "#ffffff" }}>
      {/* Messages Area */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 0" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 24px" }}>
          {messages.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 400, textAlign: "center" }}>
              <div style={{
                width: 56, height: 56, borderRadius: "50%",
                background: "linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)",
                display: "flex", alignItems: "center", justifyContent: "center",
                marginBottom: 16, boxShadow: "0 4px 12px rgba(124,58,237,0.25)"
              }}>
                <Sparkles size={28} color="#fff" />
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: "#111827", marginBottom: 8 }}>
                How can I help you today?
              </h3>
              <p style={{ fontSize: 14, color: "#6b7280", maxWidth: 400, lineHeight: 1.5 }}>
                I have access to all your leads, clients, call history, WhatsApp messages, emails, and Stripe data. Ask me anything.
              </p>
              <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, maxWidth: 480, width: "100%" }}>
                {[
                  "How many deals did Rob close this week?",
                  "Show me all dunning customers",
                  "Which leads need a callback today?",
                  "What's the team conversion rate?",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => { setInput(suggestion); inputRef.current?.focus(); }}
                    style={{
                      textAlign: "left", fontSize: 13, padding: "12px 14px",
                      borderRadius: 10, border: "1px solid #e5e7eb",
                      background: "#fafafa", color: "#374151", cursor: "pointer",
                      transition: "all 0.15s", lineHeight: 1.4,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#f3f0ff"; e.currentTarget.style.borderColor = "#c4b5fd"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "#fafafa"; e.currentTarget.style.borderColor = "#e5e7eb"; }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>


            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                display: "flex",
                gap: 12,
                marginBottom: 24,
                alignItems: "flex-start",
              }}
            >
              {/* Avatar */}
              <div style={{
                width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: msg.role === "assistant"
                  ? "linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)"
                  : "#e5e7eb",
                marginTop: 2,
              }}>
                {msg.role === "assistant" ? (
                  <Sparkles size={16} color="#fff" />
                ) : (
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>
                    You
                  </span>
                )}
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12, fontWeight: 600, marginBottom: 4,
                  color: msg.role === "assistant" ? "#7c3aed" : "#374151",
                }}>
                  {msg.role === "assistant" ? "Sir Carlton" : "You"}
                </div>
                <div style={{
                  fontSize: 14, lineHeight: 1.6, color: "#111827",
                  whiteSpace: "pre-wrap", wordBreak: "break-word",
                }}>
                  {msg.role === "assistant" ? formatContent(msg.content) : msg.content}
                </div>
                {msg.csvData && (
                  <button
                    onClick={() => handleCsvDownload(msg.csvData!)}
                    style={{
                      marginTop: 12, padding: "10px 20px", borderRadius: 8,
                      border: "none", background: "#16a34a", color: "#fff",
                      fontSize: 14, fontWeight: 700, cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 8,
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#15803d"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "#16a34a"; }}
                  >
                    📁 Download CSV for Zoho Import
                  </button>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div style={{ display: "flex", gap: 12, marginBottom: 24, alignItems: "flex-start" }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)",
                marginTop: 2,
              }}>
                <Sparkles size={16} color="#fff" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: "#7c3aed" }}>
                  Sir Carlton
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ display: "flex", gap: 4 }}>
                    <span className="animate-bounce" style={{ width: 6, height: 6, borderRadius: "50%", background: "#7c3aed", display: "inline-block", animationDelay: "0ms" }} />
                    <span className="animate-bounce" style={{ width: 6, height: 6, borderRadius: "50%", background: "#7c3aed", display: "inline-block", animationDelay: "150ms" }} />
                    <span className="animate-bounce" style={{ width: 6, height: 6, borderRadius: "50%", background: "#7c3aed", display: "inline-block", animationDelay: "300ms" }} />
                  </div>
                  <span style={{ fontSize: 13, color: "#6b7280" }}>Thinking...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area — fixed at bottom */}
      <div style={{
        borderTop: "1px solid #f3f4f6",
        padding: "16px 24px 20px",
        background: "#ffffff",
      }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{
            display: "flex", alignItems: "flex-end", gap: 12,
            background: "#f9fafb", borderRadius: 14,
            border: "1px solid #e5e7eb", padding: "10px 14px",
            transition: "border-color 0.15s, box-shadow 0.15s",
          }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "#7c3aed"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(124,58,237,0.08)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.boxShadow = "none"; }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Sir Carlton anything..."
              disabled={isLoading}
              rows={1}
              style={{
                flex: 1, resize: "none", border: "none", outline: "none",
                background: "transparent", fontSize: 14, lineHeight: 1.5,
                color: "#111827", minHeight: 24, maxHeight: 120,
                fontFamily: "inherit",
              }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              style={{
                width: 36, height: 36, borderRadius: 10,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: input.trim() && !isLoading ? "#7c3aed" : "#e5e7eb",
                color: input.trim() && !isLoading ? "#fff" : "#9ca3af",
                border: "none", cursor: input.trim() && !isLoading ? "pointer" : "not-allowed",
                transition: "all 0.15s", flexShrink: 0,
              }}
            >
              <Send size={18} />
            </button>
          </div>
          <p style={{ fontSize: 11, color: "#9ca3af", textAlign: "center", marginTop: 8 }}>
            Sir Carlton has access to your leads, clients, calls, WhatsApp, emails & Stripe data
          </p>
        </div>
      </div>
    </div>
  );
}

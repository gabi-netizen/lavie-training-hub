import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Send } from "lucide-react";

interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export function PersonalButlerTab() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const askButler = trpc.manager.askButler.useMutation();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
      const result = await askButler.mutateAsync({ question });
      const aiMsg: Message = {
        id: Date.now() + 1,
        role: "assistant",
        content: result.answer,
        timestamp: new Date(),
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

  const formatContent = (content: string) => {
    // Basic formatting: bold (**text**), newlines
    return content.split("\n").map((line, i) => {
      const formatted = line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
      return (
        <p
          key={i}
          className="mb-1 last:mb-0"
          dangerouslySetInnerHTML={{ __html: formatted }}
        />
      );
    });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-220px)] bg-gradient-to-b from-purple-50 to-white rounded-xl border border-purple-200 shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-purple-100 bg-white rounded-t-xl">
        <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center">
          <span className="text-white text-lg">🎩</span>
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">My Personal Butler</h2>
          <p className="text-sm text-gray-600">Ask me anything about your leads, deals & performance</p>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center mb-4">
              <span className="text-3xl">🎩</span>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Hello! I'm your Personal Butler</h3>
            <p className="text-sm text-gray-600 max-w-md">
              Ask me anything about your leads, callbacks, deals, or client data. I have access to all your performance metrics.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-2 max-w-md">
              {[
                "How many deals did I close this month?",
                "Show me my pending callbacks",
                "What's my conversion rate?",
                "Which leads are overdue?",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => { setInput(suggestion); inputRef.current?.focus(); }}
                  className="text-left text-xs px-3 py-2 rounded-lg border border-purple-200 text-gray-800 hover:bg-purple-50 transition-colors"
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
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                msg.role === "user"
                  ? "bg-purple-600 text-white"
                  : "bg-white border border-gray-200 text-gray-900 shadow-sm"
              }`}
            >
              <div className="text-sm leading-relaxed">
                {msg.role === "assistant" ? formatContent(msg.content) : msg.content}
              </div>
              <div
                className={`text-[10px] mt-1 ${
                  msg.role === "user" ? "text-purple-200" : "text-gray-500"
                }`}
              >
                {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
                <span className="text-xs text-gray-600">Thinking...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="px-6 py-4 border-t border-purple-100 bg-white rounded-b-xl">
        <div className="flex items-center gap-3">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask your butler anything..."
            disabled={isLoading}
            className="flex-1 px-4 py-3 rounded-xl border border-gray-300 text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="p-3 rounded-xl bg-purple-600 text-white hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

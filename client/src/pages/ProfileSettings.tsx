/**
 * ProfileSettings — Agent profile page
 * Allows agents to set their CloudTalk Agent ID for click-to-call functionality
 */
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Phone, User, Settings, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ProfileSettings() {
  const { user } = useAuth();
  const { data: profile, refetch } = trpc.contacts.myProfile.useQuery();
  const { data: agents } = trpc.contacts.cloudtalkAgents.useQuery();

  const [agentId, setAgentId] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile?.cloudtalkAgentId) {
      setAgentId(profile.cloudtalkAgentId);
    }
  }, [profile]);

  const setIdMutation = trpc.contacts.setCloudtalkAgentId.useMutation({
    onSuccess: () => {
      toast.success("CloudTalk Agent ID saved ✅");
      setSaved(true);
      refetch();
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (err) => toast.error(err.message ?? "Failed to save"),
  });

  const handleSave = () => {
    setIdMutation.mutate({ cloudtalkAgentId: agentId.trim() });
  };

  const matchedAgent = agents?.find((a) => a.id === agentId);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
            <Settings size={20} className="text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Profile Settings</h1>
            <p className="text-sm text-gray-600">{user?.name} · {user?.email}</p>
          </div>
        </div>

        {/* CloudTalk Section */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center gap-2.5 mb-1">
            <Phone size={18} className="text-green-600" />
            <h2 className="text-base font-bold text-gray-900">CloudTalk Click-to-Call</h2>
          </div>
          <p className="text-sm text-gray-600 mb-5">
            Set your CloudTalk Agent ID so the "Call Now" button dials you automatically — no copy-paste needed.
          </p>

          {/* Agent ID input */}
          <div className="space-y-3">
            <label className="text-sm font-semibold text-gray-800">Your CloudTalk Agent ID</label>
            <div className="flex gap-2">
              <Input
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                placeholder="e.g. 178617"
                className="font-mono text-sm"
              />
              <Button
                onClick={handleSave}
                disabled={setIdMutation.isPending || !agentId.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white shrink-0"
              >
                {setIdMutation.isPending ? "Saving…" : saved ? "Saved ✓" : "Save"}
              </Button>
            </div>

            {/* Matched agent confirmation */}
            {matchedAgent && (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <CheckCircle2 size={14} />
                <span>Matched: <strong>{matchedAgent.firstname} {matchedAgent.lastname}</strong> ({matchedAgent.email})</span>
              </div>
            )}
            {agentId && !matchedAgent && agents && agents.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <AlertCircle size={14} />
                <span>ID not found in CloudTalk — check the list below</span>
              </div>
            )}
          </div>

          {/* Agent list from CloudTalk */}
          {agents && agents.length > 0 && (
            <div className="mt-6">
              <p className="text-sm font-semibold text-gray-800 mb-3">All CloudTalk Agents — click to select</p>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {agents.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => setAgentId(agent.id)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-colors ${
                      agentId === agent.id
                        ? "border-indigo-400 bg-indigo-50"
                        : "border-gray-200 bg-gray-50 hover:bg-gray-100"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700">
                        {agent.firstname?.[0]}{agent.lastname?.[0]}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {agent.firstname} {agent.lastname}
                        </p>
                        <p className="text-xs text-gray-600">{agent.email}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-mono text-gray-500">ID: {agent.id}</p>
                      <span className={`text-xs font-medium ${
                        agent.availability_status === "online" ? "text-green-600" : "text-gray-400"
                      }`}>
                        {agent.availability_status}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {agents && agents.length === 0 && (
            <p className="text-sm text-gray-500 mt-4">Could not load CloudTalk agents. Enter your Agent ID manually.</p>
          )}
        </div>

        {/* How it works */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-blue-900 mb-2">How Click-to-Call works</h3>
          <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
            <li>You click "Call Now" on any customer card</li>
            <li>CloudTalk calls <strong>your phone</strong> first</li>
            <li>Once you pick up, CloudTalk connects you to the customer</li>
          </ol>
          <p className="text-xs text-blue-700 mt-3">
            You must be logged in to CloudTalk and set to "Online" for this to work.
          </p>
        </div>

      </div>
    </div>
  );
}

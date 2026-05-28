import { trpc } from "@/lib/trpc";
import { 
  ArrowLeft, 
  MessageCircle, 
  MessageSquare, 
  Calendar, 
  User, 
  CheckCircle2, 
  Clock, 
  XCircle, 
  Eye, 
  Reply, 
  Users,
  ExternalLink,
  Loader2,
  Send
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface CampaignDetailProps {
  campaignId: number;
  onBack: () => void;
}

export function CampaignDetail({ campaignId, onBack }: CampaignDetailProps) {
  const { data: campaign, isLoading, refetch } = trpc.campaigns.getById.useQuery({ id: campaignId });

  const pushToOpening = trpc.campaigns.pushToOpening.useMutation({
    onSuccess: (data) => {
      toast.success(`Successfully pushed ${data.created} contacts to Opening!`);
      refetch();
    },
    onError: (err) => toast.error(`Failed to push: ${err.message}`),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-black">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  if (!campaign) return null;

  // ─── Funnel Stats Calculation ─────────────────────────────────────────────
  const total = campaign.totalRecipients || 0;
  const sent = campaign.sentCount || 0;
  const delivered = campaign.deliveredCount || 0;
  const read = campaign.readCount || 0;
  const replied = campaign.repliedCount || 0;

  const sentPct = total > 0 ? (sent / total) * 100 : 0;
  const deliveredPct = sent > 0 ? (delivered / sent) * 100 : 0;
  const readPct = delivered > 0 ? (read / delivered) * 100 : 0;
  const repliedPct = campaign.channel === 'whatsapp' 
    ? (read > 0 ? (replied / read) * 100 : 0)
    : (sent > 0 ? (replied / sent) * 100 : 0);

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 hover:bg-gray-100 rounded-full text-black transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-black">{campaign.name}</h2>
              <StatusBadge status={campaign.status} />
            </div>
            <div className="flex items-center gap-3 mt-1">
              <div className="flex items-center gap-1 text-[10px] font-bold text-black opacity-60 uppercase tracking-wider">
                {campaign.channel === 'whatsapp' ? <MessageCircle size={12} className="text-[#25D366]" /> : <MessageSquare size={12} className="text-blue-500" />}
                {campaign.channel}
              </div>
              <div className="flex items-center gap-1 text-[10px] font-bold text-black opacity-60 uppercase tracking-wider">
                <Calendar size={12} />
                {format(new Date(campaign.createdAt), 'MMM d, yyyy HH:mm')}
              </div>
            </div>
          </div>
        </div>

        {campaign.status === 'completed' && (
          <button
            onClick={() => pushToOpening.mutate({ id: campaignId })}
            disabled={pushToOpening.isPending || read === 0}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500 transition-colors font-bold text-sm shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pushToOpening.isPending ? <Loader2 size={16} className="animate-spin" /> : <ExternalLink size={16} />}
            Push to Opening
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* Funnel Visualization */}
        <section className="space-y-4">
          <h3 className="text-xs font-black text-black uppercase tracking-widest opacity-40">Campaign Funnel</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 gap-4">
            <FunnelStep label="Total" count={total} percentage={100} color="bg-gray-200" icon={Users} />
            <FunnelStep label="Sent" count={sent} percentage={sentPct} color="bg-blue-400" icon={Send} />
            <FunnelStep label="Delivered" count={delivered} percentage={deliveredPct} color="bg-blue-600" icon={CheckCircle2} />
            {campaign.channel === 'whatsapp' && (
              <FunnelStep label="Read" count={read} percentage={readPct} color="bg-[#53bdeb]" icon={Eye} />
            )}
            <FunnelStep label="Replied" count={replied} percentage={repliedPct} color="bg-[#25D366]" icon={Reply} />
          </div>
        </section>

        {/* Campaign Info Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Message Content */}
            <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
              <h4 className="text-[10px] font-black text-black uppercase tracking-widest opacity-40 mb-3">Message Content</h4>
              <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                {campaign.channel === 'whatsapp' ? (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-black">Template: <span className="text-blue-600 font-mono">{campaign.templateName}</span></p>
                    <p className="text-xs text-black italic opacity-60">Template content is managed in Twilio Content Editor.</p>
                  </div>
                ) : (
                  <p className="text-sm text-black whitespace-pre-wrap font-medium">{campaign.messageBody}</p>
                )}
              </div>
            </div>

            {/* Recipients Table */}
            <div className="space-y-4">
              <h4 className="text-[10px] font-black text-black uppercase tracking-widest opacity-40">Recipients Log</h4>
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-black uppercase tracking-wider">Recipient</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-black uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-right text-[10px] font-bold text-black uppercase tracking-wider">Timestamps</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {campaign.sends?.map((send: any) => (
                      <tr key={send.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-black font-bold text-[10px]">
                              <User size={14} />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-black">{send.phoneNumber}</p>
                              <p className="text-[10px] text-black opacity-60">Contact ID: #{send.contactId || 'N/A'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <SendStatusBadge status={send.sendStatus} error={send.errorMessage} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="space-y-0.5">
                            {send.sentAt && <p className="text-[9px] font-bold text-black uppercase">Sent: <span className="opacity-60">{format(new Date(send.sentAt), 'HH:mm:ss')}</span></p>}
                            {send.deliveredAt && <p className="text-[9px] font-bold text-green-700 uppercase">Delivered: <span className="opacity-60">{format(new Date(send.deliveredAt), 'HH:mm:ss')}</span></p>}
                            {send.readAt && <p className="text-[9px] font-bold text-blue-600 uppercase">Read: <span className="opacity-60">{format(new Date(send.readAt), 'HH:mm:ss')}</span></p>}
                            {send.repliedAt && <p className="text-[9px] font-bold text-[#25D366] uppercase">Replied: <span className="opacity-60">{format(new Date(send.repliedAt), 'HH:mm:ss')}</span></p>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Sidebar Info */}
          <div className="space-y-6">
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
              <h4 className="text-[10px] font-black text-black uppercase tracking-widest opacity-40">Audience Filter</h4>
              <div className="space-y-3">
                <FilterItem label="Department" value={(campaign.audienceFilter as any)?.department || 'All'} />
                <FilterItem label="Lead Type" value={(campaign.audienceFilter as any)?.leadType || 'All'} />
                <FilterItem label="Status" value={(campaign.audienceFilter as any)?.status || 'All'} />
                <FilterItem label="Source" value={(campaign.audienceFilter as any)?.source || 'All'} />
                <FilterItem label="Agent" value={(campaign.audienceFilter as any)?.agentName || 'All'} />
              </div>
            </div>

            <div className="bg-blue-600 rounded-xl p-5 text-white shadow-lg">
              <h4 className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-4">Quick Stats</h4>
              <div className="space-y-4">
                <div className="flex justify-between items-end border-b border-white/10 pb-2">
                  <span className="text-xs font-bold opacity-80">Conversion Rate</span>
                  <span className="text-xl font-black">{repliedPct.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between items-end border-b border-white/10 pb-2">
                  <span className="text-xs font-bold opacity-80">Delivery Rate</span>
                  <span className="text-xl font-black">{deliveredPct.toFixed(1)}%</span>
                </div>
                {campaign.channel === 'whatsapp' && (
                  <div className="flex justify-between items-end border-b border-white/10 pb-2">
                    <span className="text-xs font-bold opacity-80">Read Rate</span>
                    <span className="text-xl font-black">{readPct.toFixed(1)}%</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FunnelStep({ label, count, percentage, color, icon: Icon }: any) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className={`p-2 rounded-lg ${color} text-black shadow-sm`}>
          <Icon size={18} />
        </div>
        <span className="text-[10px] font-black text-black opacity-40 uppercase tracking-widest">{label}</span>
      </div>
      <div>
        <p className="text-2xl font-black text-black">{count}</p>
        <div className="flex items-center gap-2 mt-1">
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full ${color}`} style={{ width: `${percentage}%` }} />
          </div>
          <span className="text-[10px] font-bold text-black">{percentage.toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
}

function FilterItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center text-xs">
      <span className="text-black opacity-60 font-medium">{label}</span>
      <span className="text-black font-bold">{value}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { bg: string; text: string; icon: any }> = {
    draft: { bg: 'bg-gray-100', text: 'text-black', icon: Clock },
    sending: { bg: 'bg-blue-100', text: 'text-blue-700', icon: Clock },
    completed: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle2 },
    cancelled: { bg: 'bg-red-100', text: 'text-red-700', icon: XCircle },
  };
  const config = configs[status] || configs.draft;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${config.bg} ${config.text} border border-black/5`}>
      <Icon size={10} />
      {status}
    </span>
  );
}

function SendStatusBadge({ status, error }: { status: string; error?: string | null }) {
  const configs: Record<string, { bg: string; text: string }> = {
    pending: { bg: 'bg-gray-100', text: 'text-black' },
    sent: { bg: 'bg-blue-50', text: 'text-blue-700' },
    delivered: { bg: 'bg-blue-100', text: 'text-blue-800' },
    read: { bg: 'bg-cyan-100', text: 'text-cyan-800' },
    replied: { bg: 'bg-green-100', text: 'text-green-800' },
    failed: { bg: 'bg-red-100', text: 'text-red-700' },
  };
  const config = configs[status] || configs.pending;
  return (
    <div className="flex flex-col gap-1">
      <span className={`inline-flex w-fit items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${config.bg} ${config.text}`}>
        {status}
      </span>
      {status === 'failed' && error && (
        <p className="text-[9px] text-red-600 font-medium max-w-[150px] leading-tight">{error}</p>
      )}
    </div>
  );
}

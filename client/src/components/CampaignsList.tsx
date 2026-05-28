import { trpc } from "@/lib/trpc";
import { 
  Plus, 
  MessageSquare, 
  MessageCircle, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  ChevronRight,
  BarChart3,
  Calendar
} from "lucide-react";
import { format } from "date-fns";

interface CampaignsListProps {
  onCreateClick: () => void;
  onCampaignClick: (id: number) => void;
}

export function CampaignsList({ onCreateClick, onCampaignClick }: CampaignsListProps) {
  const { data: campaigns, isLoading, error } = trpc.campaigns.list.useQuery(undefined, {
    refetchInterval: 15000, // Refresh every 15s
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-black">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-red-600 p-4 text-center">
        <XCircle size={32} className="mb-2" />
        <p className="font-semibold">Failed to load campaigns</p>
        <p className="text-sm">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
        <div>
          <h2 className="text-lg font-bold text-black">Campaigns</h2>
          <p className="text-xs text-black">Manage and track your WhatsApp & SMS outreach</p>
        </div>
        <button
          onClick={onCreateClick}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors font-semibold text-sm shadow-sm"
        >
          <Plus size={18} />
          Create Campaign
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {campaigns?.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-black py-20">
            <BarChart3 size={48} className="mb-3 opacity-20" />
            <p className="text-lg font-medium">No campaigns yet</p>
            <p className="text-sm opacity-60">Create your first campaign to start outreach</p>
          </div>
        ) : (
          <div className="min-w-full inline-block align-middle">
            <table className="min-w-full border-separate border-spacing-0">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-black uppercase tracking-wider border-b border-gray-200">Name</th>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-black uppercase tracking-wider border-b border-gray-200">Channel</th>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-black uppercase tracking-wider border-b border-gray-200">Status</th>
                  <th className="px-6 py-3 text-center text-[10px] font-bold text-black uppercase tracking-wider border-b border-gray-200">Recipients</th>
                  <th className="px-6 py-3 text-center text-[10px] font-bold text-black uppercase tracking-wider border-b border-gray-200">Sent</th>
                  <th className="px-6 py-3 text-center text-[10px] font-bold text-black uppercase tracking-wider border-b border-gray-200">Delivered</th>
                  <th className="px-6 py-3 text-center text-[10px] font-bold text-black uppercase tracking-wider border-b border-gray-200">Read</th>
                  <th className="px-6 py-3 text-center text-[10px] font-bold text-black uppercase tracking-wider border-b border-gray-200">Replied</th>
                  <th className="px-6 py-3 text-right text-[10px] font-bold text-black uppercase tracking-wider border-b border-gray-200">Created At</th>
                  <th className="px-4 py-3 border-b border-gray-200"></th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {campaigns?.map((campaign) => (
                  <tr 
                    key={campaign.id} 
                    className="hover:bg-gray-50 cursor-pointer transition-colors group"
                    onClick={() => onCampaignClick(campaign.id)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-bold text-black">{campaign.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {campaign.channel === 'whatsapp' ? (
                          <MessageCircle size={16} className="text-[#25D366]" />
                        ) : (
                          <MessageSquare size={16} className="text-blue-500" />
                        )}
                        <span className="text-xs text-black capitalize font-medium">{campaign.channel}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge status={campaign.status} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-bold text-black">
                      {campaign.totalRecipients}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-bold text-black">
                      {campaign.sentCount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-bold text-black">
                      {campaign.deliveredCount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-bold text-black">
                      {campaign.channel === 'whatsapp' ? campaign.readCount : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-bold text-black">
                      {campaign.repliedCount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-xs font-medium text-black">
                      <div className="flex flex-col items-end">
                        <span className="flex items-center gap-1">
                          <Calendar size={10} />
                          {format(new Date(campaign.createdAt), 'MMM d, yyyy')}
                        </span>
                        <span className="text-[10px] opacity-60">
                          {format(new Date(campaign.createdAt), 'HH:mm')}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-right">
                      <ChevronRight size={18} className="text-black opacity-20 group-hover:opacity-100 transition-opacity" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
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
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${config.bg} ${config.text} border border-black/5`}>
      <Icon size={10} />
      {status}
    </span>
  );
}

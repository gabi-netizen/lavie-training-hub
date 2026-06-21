import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  LogOut,
  Phone,
  Users,
  BookOpen,
  ChevronDown,
  ContactRound,
  ShieldCheck,
  Settings,
  PhoneCall,
  LayoutDashboard,
  Smartphone,
  Mic,
  TrendingUp,
  Upload,
  Sparkles,
  Shield,
  Mail,
  MessageSquare,
  Rocket,
  ShieldHalf,
  Ticket,
  Brain,
  Gauge,
  Swords,
  User,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";

// ─── Navigation Data ────────────────────────────────────────────────────────────

// Calls dropdown items
const CALLS_ITEMS_AGENT = [
  { path: "/dialler", label: "Dialler", icon: Phone },
  { path: "/contacts", label: "Contacts", icon: ContactRound },
  { path: "/call-log", label: "Call Log", icon: PhoneCall },
];
const CALLS_ITEMS_ADMIN = [
  ...CALLS_ITEMS_AGENT,
  { path: "/phone-numbers", label: "Phone Pool", icon: Smartphone },
  { path: "/users", label: "Users", icon: Users },
];

// AI Coach dropdown items
const AI_COACH_ITEMS_AGENT = [
  { tab: "upload", label: "Upload Call", icon: Upload },
  { tab: "my-calls", label: "Agent View", icon: Users },
];
const AI_COACH_ITEMS_ADMIN = [
  { tab: "upload", label: "Upload Call", icon: Upload },
  { tab: "my-calls", label: "Agent View", icon: Users },
  { tab: "performance", label: "Performance", icon: TrendingUp },
  { tab: "manager", label: "Manager View", icon: BarChart3 },
  { tab: "ai-feedback", label: "What Winners Do", icon: Sparkles },
];

// Opening dropdown items
const OPENING_ITEMS = [
  { path: "/workspace", label: "Workspace", icon: LayoutDashboard },
  { path: "/opening-dashboard", label: "Opening Dashboard", icon: Gauge },
  { path: "/training", label: "Training", icon: BookOpen },
];

// Retention dropdown items
const RETENTION_ITEMS = [
  { path: "/retention-workspace/guy", label: "Guy's Workspace", icon: User },
  { path: "/retention-workspace/rob", label: "Rob's Workspace", icon: User },
  { path: "/retention-workspace/james", label: "James's Workspace", icon: User },
  { path: "/command-centre?tab=customers", label: "Customers", icon: ContactRound },
];

// Mobile bottom bar items
const MOBILE_NAV_ITEMS_AGENT = [
  { path: "/call-center-dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/dialler", label: "Dialler", icon: Phone },
  { path: "/workspace", label: "Workspace", icon: LayoutDashboard, highlight: true },
  { path: "/training", label: "Training", icon: BookOpen },
  { path: "/ai-coach", label: "AI Coach", icon: BarChart3 },
];
const MOBILE_NAV_ITEMS_ADMIN = [
  { path: "/call-center-dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/dialler", label: "Dialler", icon: Phone },
  { path: "/workspace", label: "Workspace", icon: LayoutDashboard, highlight: true },
  { path: "/command-centre", label: "Command", icon: Shield },
  { path: "/ai-coach", label: "AI Coach", icon: BarChart3 },
];

// ─── Component ──────────────────────────────────────────────────────────────────

export default function TopNav() {
  const [location, navigate] = useLocation();
  const { user, isAuthenticated, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [callsOpen, setCallsOpen] = useState(false);
  const [aiCoachOpen, setAiCoachOpen] = useState(false);
  const [openingOpen, setOpeningOpen] = useState(false);
  const [retentionOpen, setRetentionOpen] = useState(false);

  const callsRef = useRef<HTMLDivElement>(null);
  const aiCoachRef = useRef<HTMLDivElement>(null);
  const openingRef = useRef<HTMLDivElement>(null);
  const retentionRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const isAdmin = user?.role === "admin";
  const isAcademy = user?.team === "academy";
  const isRetention = user?.team === "retention";
  const isOpening = user?.team === "opening";
  const callsItems = isAdmin ? CALLS_ITEMS_ADMIN : CALLS_ITEMS_AGENT;
  const aiCoachItems = isAdmin ? AI_COACH_ITEMS_ADMIN : AI_COACH_ITEMS_AGENT;
  const mobileItems = isAcademy
    ? [
        { path: "/workspace", label: "Workspace", icon: LayoutDashboard, highlight: true },
        { path: "/training", label: "Training", icon: BookOpen },
      ]
    : isAdmin ? MOBILE_NAV_ITEMS_ADMIN : MOBILE_NAV_ITEMS_AGENT;

  // Close all dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (callsRef.current && !callsRef.current.contains(e.target as Node)) setCallsOpen(false);
      if (aiCoachRef.current && !aiCoachRef.current.contains(e.target as Node)) setAiCoachOpen(false);
      if (openingRef.current && !openingRef.current.contains(e.target as Node)) setOpeningOpen(false);
      if (retentionRef.current && !retentionRef.current.contains(e.target as Node)) setRetentionOpen(false);
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Close all dropdowns helper
  const closeAll = () => {
    setCallsOpen(false);
    setAiCoachOpen(false);
    setOpeningOpen(false);
    setRetentionOpen(false);
  };

  // Active states
  const dashboardActive = location === "/call-center-dashboard" || location === "/";
  const callsActive = ["/dialler", "/contacts", "/call-log", "/phone-numbers", "/users"].some(p => location === p);
  const aiCoachActive = location === "/ai-coach" || location.startsWith("/ai-coach");
  const openingActive = ["/workspace", "/opening-dashboard", "/training"].some(p => location === p);
  const retentionActive = location.startsWith("/retention-workspace") || location.includes("customers");
  const commandCentreActive = location === "/command-centre";
  const supportTicketsActive = location === "/support-tickets";

  const initials = user?.name
    ? user.name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  // Navigate to AI Coach with a specific tab
  const goToAiCoachTab = (tab: string) => {
    setAiCoachOpen(false);
    window.location.href = `/ai-coach?tab=${tab}`;
  };

  // Visibility checks
  const showOpening = isAdmin || isOpening || (!isRetention && !isAcademy);
  const showRetention = isAdmin || isRetention;

  return (
    <>
      {/* ─── Desktop Top Nav ─────────────────────────────────────────────────── */}
      <nav className="hidden md:flex items-center justify-between px-6 py-0 sticky top-0 z-50 border-b border-white/20 backdrop-blur-md bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 shadow-lg shadow-black/10" style={{ minHeight: 56 }}>

        {/* Logo */}
        <Link href="/">
          <div className="flex items-center gap-2.5 cursor-pointer select-none group">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-amber-400 to-yellow-600 text-white shadow-md shadow-amber-500/30 group-hover:shadow-amber-500/60 transition-shadow duration-300">
              <Swords size={16} className="text-white" />
            </div>
            <span className="font-black text-sm tracking-widest bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 bg-clip-text text-transparent group-hover:from-amber-200 group-hover:to-yellow-300 transition-all duration-300" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              MAXIMUS
            </span>
          </div>
        </Link>

        {/* Nav Items */}
        <div className="flex items-center gap-0.5">

          {/* Academy users: show only Workspace and Training */}
          {isAcademy ? (
            <>
              <Link href="/workspace">
                <button className={cn(
                  "flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm transition-all duration-200 font-medium",
                  location === "/workspace"
                    ? "text-cyan-300 bg-white/10 shadow-inner shadow-cyan-500/10"
                    : "text-white/70 hover:text-white hover:bg-white/5"
                )}>
                  <LayoutDashboard size={14} />
                  Workspace
                </button>
              </Link>
              <Link href="/training">
                <button className={cn(
                  "flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm transition-all duration-200 font-medium",
                  location === "/training"
                    ? "text-cyan-300 bg-white/10 shadow-inner shadow-cyan-500/10"
                    : "text-white/70 hover:text-white hover:bg-white/5"
                )}>
                  <BookOpen size={14} />
                  Training
                </button>
              </Link>
            </>
          ) : (
            <>
              {/* 1. Call Center Dashboard — visible to ALL */}
              <Link href="/call-center-dashboard">
                <button className={cn(
                  "flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm transition-all duration-200 font-medium",
                  dashboardActive
                    ? "text-cyan-300 bg-white/10 shadow-inner shadow-cyan-500/10"
                    : "text-white/70 hover:text-white hover:bg-white/5"
                )}>
                  <Gauge size={14} />
                  <span className="hidden lg:inline">Call Center Dashboard</span>
                  <span className="lg:hidden">Dashboard</span>
                </button>
              </Link>

              {/* 2. Opening dropdown — Opening team + admins */}
              {showOpening && (
                <div className="relative" ref={openingRef}>
                  <button
                    onClick={() => { closeAll(); setOpeningOpen(v => !v); }}
                    className={cn(
                      "flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm transition-all duration-200 font-medium",
                      openingActive
                        ? "text-cyan-300 bg-white/10 shadow-inner shadow-cyan-500/10"
                        : "text-white/70 hover:text-white hover:bg-white/5"
                    )}
                  >
                    <Rocket size={14} />
                    Opening
                    <ChevronDown size={11} className={cn("transition-transform duration-200 opacity-60", openingOpen && "rotate-180")} />
                  </button>

                  <div className={cn(
                    "absolute left-0 top-full mt-2 w-52 rounded-xl border border-white/10 shadow-xl bg-slate-800/95 backdrop-blur-lg py-1.5 z-50 transition-all duration-200 origin-top",
                    openingOpen ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
                  )}>
                    {OPENING_ITEMS.map(({ path, label, icon: Icon }) => {
                      const active = location === path;
                      return (
                        <Link key={path} href={path} onClick={() => setOpeningOpen(false)}>
                          <div className={cn(
                            "flex items-center gap-2.5 px-4 py-2.5 text-sm cursor-pointer transition-all duration-150 mx-1.5 rounded-lg",
                            active
                              ? "text-cyan-300 bg-cyan-500/10 font-medium"
                              : "text-white/70 hover:text-white hover:bg-white/5"
                          )}>
                            <Icon size={14} className={active ? "text-cyan-400" : "opacity-60"} />
                            {label}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 3. Retention dropdown — Retention team + admins */}
              {showRetention && (
                <div className="relative" ref={retentionRef}>
                  <button
                    onClick={() => { closeAll(); setRetentionOpen(v => !v); }}
                    className={cn(
                      "flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm transition-all duration-200 font-medium",
                      retentionActive
                        ? "text-cyan-300 bg-white/10 shadow-inner shadow-cyan-500/10"
                        : "text-white/70 hover:text-white hover:bg-white/5"
                    )}
                  >
                    <ShieldHalf size={14} />
                    Retention
                    <ChevronDown size={11} className={cn("transition-transform duration-200 opacity-60", retentionOpen && "rotate-180")} />
                  </button>

                  <div className={cn(
                    "absolute left-0 top-full mt-2 w-52 rounded-xl border border-white/10 shadow-xl bg-slate-800/95 backdrop-blur-lg py-1.5 z-50 transition-all duration-200 origin-top",
                    retentionOpen ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
                  )}>
                    {RETENTION_ITEMS.map(({ path, label, icon: Icon }) => {
                      const active = location === path || location.startsWith(path.split("?")[0]);
                      return (
                        <Link key={path} href={path} onClick={() => setRetentionOpen(false)}>
                          <div className={cn(
                            "flex items-center gap-2.5 px-4 py-2.5 text-sm cursor-pointer transition-all duration-150 mx-1.5 rounded-lg",
                            active
                              ? "text-cyan-300 bg-cyan-500/10 font-medium"
                              : "text-white/70 hover:text-white hover:bg-white/5"
                          )}>
                            <Icon size={14} className={active ? "text-cyan-400" : "opacity-60"} />
                            {label}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 4. Command Centre — admin only */}
              {isAdmin && (
                <Link href="/command-centre">
                  <button className={cn(
                    "flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm transition-all duration-200 font-medium",
                    commandCentreActive
                      ? "text-cyan-300 bg-white/10 shadow-inner shadow-cyan-500/10"
                      : "text-white/70 hover:text-white hover:bg-white/5"
                  )}>
                    <Settings size={14} />
                    Command Centre
                  </button>
                </Link>
              )}

              {/* 5. Support Tickets — admin only */}
              {isAdmin && (
                <Link href="/support-tickets">
                  <button className={cn(
                    "flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm transition-all duration-200 font-medium",
                    supportTicketsActive
                      ? "text-cyan-300 bg-white/10 shadow-inner shadow-cyan-500/10"
                      : "text-white/70 hover:text-white hover:bg-white/5"
                  )}>
                    <Ticket size={14} />
                    Support Tickets
                  </button>
                </Link>
              )}

              {/* 6. AI Coach dropdown */}
              <div className="relative" ref={aiCoachRef}>
                <button
                  onClick={() => { closeAll(); setAiCoachOpen(v => !v); }}
                  className={cn(
                    "flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm transition-all duration-200 font-medium",
                    aiCoachActive
                      ? "text-cyan-300 bg-white/10 shadow-inner shadow-cyan-500/10"
                      : "text-white/70 hover:text-white hover:bg-white/5"
                  )}
                >
                  <Brain size={14} />
                  AI Coach
                  <ChevronDown size={11} className={cn("transition-transform duration-200 opacity-60", aiCoachOpen && "rotate-180")} />
                </button>

                <div className={cn(
                  "absolute left-0 top-full mt-2 w-52 rounded-xl border border-white/10 shadow-xl bg-slate-800/95 backdrop-blur-lg py-1.5 z-50 transition-all duration-200 origin-top",
                  aiCoachOpen ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
                )}>
                  {aiCoachItems.map(({ tab, label, icon: Icon }) => {
                    const active = location === "/ai-coach" && new URLSearchParams(window.location.search).get("tab") === tab;
                    return (
                      <button
                        key={tab}
                        onClick={() => goToAiCoachTab(tab)}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-4 py-2.5 text-sm cursor-pointer transition-all duration-150 mx-1.5 rounded-lg text-left",
                          active
                            ? "text-cyan-300 bg-cyan-500/10 font-medium"
                            : "text-white/70 hover:text-white hover:bg-white/5"
                        )}
                        style={{ width: "calc(100% - 12px)" }}
                      >
                        <Icon size={14} className={active ? "text-cyan-400" : "opacity-60"} />
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 7. Calls dropdown (Dialler, Contacts, etc.) */}
              <div className="relative" ref={callsRef}>
              <button
                onClick={() => { closeAll(); setCallsOpen(v => !v); }}
                className={cn(
                  "flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm transition-all duration-200 font-medium",
                  callsActive
                    ? "text-cyan-300 bg-white/10 shadow-inner shadow-cyan-500/10"
                    : "text-white/70 hover:text-white hover:bg-white/5"
                )}
              >
                <ContactRound size={14} />
                Contacts & Dialler
                <ChevronDown size={11} className={cn("transition-transform duration-200 opacity-60", callsOpen && "rotate-180")} />
              </button>

                <div className={cn(
                  "absolute left-0 top-full mt-2 w-48 rounded-xl border border-white/10 shadow-xl bg-slate-800/95 backdrop-blur-lg py-1.5 z-50 transition-all duration-200 origin-top",
                  callsOpen ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
                )}>
                  {callsItems.map(({ path, label, icon: Icon }) => {
                    const active = location === path;
                    return (
                      <Link key={path} href={path} onClick={() => setCallsOpen(false)}>
                        <div className={cn(
                          "flex items-center gap-2.5 px-4 py-2.5 text-sm cursor-pointer transition-all duration-150 mx-1.5 rounded-lg",
                          active
                            ? "text-cyan-300 bg-cyan-500/10 font-medium"
                            : "text-white/70 hover:text-white hover:bg-white/5"
                        )}>
                          <Icon size={14} className={active ? "text-cyan-400" : "opacity-60"} />
                          {label}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* User Avatar & Menu */}
        <div className="relative" ref={menuRef}>
          {isAuthenticated ? (
            <button
              onClick={() => setMenuOpen(v => !v)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/5 transition-all duration-200 group"
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-gradient-to-br from-cyan-400 to-teal-500 text-white shadow-md shadow-cyan-500/20 group-hover:shadow-cyan-500/40 transition-shadow">
                {initials}
              </div>
              <span className="text-sm text-white/80 max-w-[100px] truncate group-hover:text-white transition-colors">{user?.name}</span>
              {isAdmin && <ShieldCheck size={12} className="text-cyan-400/70" />}
              <ChevronDown size={12} className="text-white/50" />
            </button>
          ) : (
            <a
              href={getLoginUrl()}
              className="text-sm px-4 py-2 rounded-lg font-medium bg-gradient-to-r from-cyan-500 to-teal-500 text-white hover:from-cyan-400 hover:to-teal-400 transition-all duration-200 shadow-md shadow-cyan-500/20"
            >
              Sign in
            </a>
          )}

          <div className={cn(
            "absolute right-0 top-full mt-2 w-48 rounded-xl border border-white/10 shadow-xl bg-slate-800/95 backdrop-blur-lg py-1.5 z-50 transition-all duration-200 origin-top-right",
            menuOpen ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
          )}>
            <div className="px-4 py-2.5 border-b border-white/10">
              <p className="text-xs text-white/50">Signed in as</p>
              <p className="text-sm font-medium text-white truncate">{user?.name}</p>
              {isAdmin && (
                <span className="inline-flex items-center gap-1 mt-1 text-xs text-cyan-400">
                  <ShieldCheck size={10} /> Admin
                </span>
              )}
            </div>
            <Link
              href="/profile"
              onClick={() => setMenuOpen(false)}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-all duration-150 mx-1.5 rounded-lg"
              style={{ width: "calc(100% - 12px)" }}
            >
              <Settings size={14} className="opacity-60" />
              Profile Settings
            </Link>
            <button
              onClick={() => { setMenuOpen(false); logout(); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-all duration-150 mx-1.5 rounded-lg"
              style={{ width: "calc(100% - 12px)" }}
            >
              <LogOut size={14} className="opacity-60" />
              Sign out
            </button>
          </div>
        </div>
      </nav>

      {/* ─── Mobile Bottom Tab Bar ───────────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around backdrop-blur-md bg-slate-900/95 border-t border-white/10 px-2 py-2 shadow-lg shadow-black/20">
        {mobileItems.map(({ path, label, icon: Icon, highlight }: any) => {
          const active =
            location === path ||
            (path === "/call-center-dashboard" && location === "/");
          return (
            <Link key={path} href={path}>
              <button
                className={cn(
                  "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all duration-200",
                  highlight && !active
                    ? "bg-gradient-to-br from-cyan-500 to-teal-500 text-white font-bold shadow-md shadow-cyan-500/30"
                    : active
                    ? "text-cyan-400 bg-white/10"
                    : "text-white/60 hover:text-white/80 hover:bg-white/5"
                )}
              >
                <Icon size={20} />
                <span className="text-[10px] font-bold">{label}</span>
              </button>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

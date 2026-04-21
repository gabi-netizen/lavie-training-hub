import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  LogOut,
  Phone,
  Trophy,
  Users,
  BookOpen,
  ChevronDown,
  ContactRound,
  ShieldCheck,
  Settings,
  PhoneCall,
  LayoutDashboard,
  Smartphone,
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";

// Admin-only tabs
const ADMIN_NAV_ITEMS = [
  { path: "/phone-numbers", label: "Phone Pool", icon: Smartphone },
];

// Visible to all logged-in users
const AGENT_NAV_ITEMS = [
  { path: "/dialler", label: "Dialler", icon: Phone },
  { path: "/contacts", label: "Contacts", icon: ContactRound },
  { path: "/call-log", label: "Call Log", icon: PhoneCall },
  { path: "/workspace", label: "Workspace", icon: LayoutDashboard, highlight: true },
  { path: "/training", label: "Training", icon: BookOpen },
  { path: "/ai-coach", label: "AI Coach", icon: BarChart3 },
  { path: "/team", label: "Team", icon: Users },
  { path: "/leaderboard", label: "Leaderboard", icon: Trophy },
];

export default function TopNav() {
  const [location] = useLocation();
  const { user, isAuthenticated, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const isAdmin = user?.role === "admin";

  const navItems = isAdmin
    ? [
        ...AGENT_NAV_ITEMS.slice(0, 3), // Dialler, Contacts, Call Log
        ...ADMIN_NAV_ITEMS,             // Phone Pool (admin only)
        ...AGENT_NAV_ITEMS.slice(3),    // Workspace, Training, AI Coach, Team, Leaderboard
      ]
    : AGENT_NAV_ITEMS;

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  return (
    <>
      {/* Desktop top nav */}
      <nav className="hidden md:flex items-center justify-between px-6 py-0 bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm" style={{ minHeight: 56 }}>
        {/* Logo */}
        <Link href={isAdmin ? "/" : "/training"}>
          <div className="flex items-center gap-2 cursor-pointer select-none">
            <div className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold bg-indigo-600 text-white">
              L
            </div>
            <span className="font-bold text-sm tracking-wide text-indigo-600" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              LAVIÉ LABS
            </span>
          </div>
        </Link>

        {/* Nav tabs */}
        <div className="flex items-center gap-1">
          {navItems.map(({ path, label, icon: Icon, highlight }: any) => {
            const active =
              location === path ||
              (path === "/dialler" && location === "/" && isAdmin) ||
              (path === "/training" && location === "/" && !isAdmin);
            return (
              <Link key={path} href={path}>
                <button
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm transition-all duration-150",
                    highlight && !active
                      ? "font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm"
                      : active
                      ? "font-medium text-indigo-600 bg-indigo-50 border-b-2 border-indigo-600 rounded-b-none"
                      : "font-medium text-gray-700 hover:text-gray-800 hover:bg-gray-100"
                  )}
                >
                  <Icon size={14} />
                  {label}
                </button>
              </Link>
            );
          })}
        </div>

        {/* User avatar */}
        <div className="relative">
          {isAuthenticated ? (
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-gray-100 transition-colors"
            >
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold bg-indigo-100 text-indigo-600">
                {initials}
              </div>
              <span className="text-sm text-gray-700 max-w-[100px] truncate">{user?.name}</span>
              {isAdmin && <ShieldCheck size={12} className="text-indigo-500" />}
              <ChevronDown size={12} className="text-gray-800" />
            </button>
          ) : (
            <a
              href={getLoginUrl()}
              className="text-sm px-4 py-1.5 rounded-md font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
            >
              Sign in
            </a>
          )}

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-44 rounded-lg border border-gray-200 shadow-lg bg-white py-1 z-50">
              <div className="px-3 py-2 border-b border-gray-100">
                <p className="text-xs text-gray-800">Signed in as</p>
                <p className="text-sm text-gray-800 font-medium truncate">{user?.name}</p>
                {isAdmin && (
                  <span className="inline-flex items-center gap-1 mt-1 text-xs text-indigo-600">
                    <ShieldCheck size={10} /> Admin
                  </span>
                )}
              </div>
              <Link
                href="/profile"
                onClick={() => setMenuOpen(false)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:text-gray-800 hover:bg-gray-50 transition-colors"
              >
                <Settings size={14} />
                Profile Settings
              </Link>
              <button
                onClick={() => { setMenuOpen(false); logout(); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:text-gray-800 hover:bg-gray-50 transition-colors"
              >
                <LogOut size={14} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around bg-white border-t-2 border-gray-900 px-2 py-2 shadow-lg">
        {navItems.map(({ path, label, icon: Icon, highlight }: any) => {
          const active =
            location === path ||
            (path === "/dialler" && location === "/" && isAdmin) ||
            (path === "/training" && location === "/" && !isAdmin);
          return (
            <Link key={path} href={path}>
              <button
                className={cn(
                  "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg border-2 transition-colors",
                  highlight && !active
                    ? "border-indigo-600 bg-indigo-600 text-white font-bold"
                    : active
                    ? "border-indigo-600 text-indigo-600 bg-indigo-50"
                    : "border-gray-900 text-gray-900 hover:bg-gray-50"
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

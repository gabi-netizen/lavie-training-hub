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
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";

// Admin-only tabs (CRM / Dialler) — hidden from regular agents
const ADMIN_NAV_ITEMS = [
  { path: "/dialler", label: "Dialler", icon: Phone },
  { path: "/contacts", label: "Contacts", icon: ContactRound },
];

// Visible to all logged-in users
const AGENT_NAV_ITEMS = [
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
    ? [...ADMIN_NAV_ITEMS, ...AGENT_NAV_ITEMS]
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
      <nav
        className="hidden md:flex items-center justify-between px-6 py-0 border-b border-white/10 sticky top-0 z-50"
        style={{ background: "oklch(0.13 0.03 240)", minHeight: 56 }}
      >
        {/* Logo */}
        <Link href={isAdmin ? "/" : "/training"}>
          <div className="flex items-center gap-2 cursor-pointer select-none">
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold"
              style={{ background: "oklch(0.72 0.19 180)", color: "#0F1923" }}
            >
              L
            </div>
            <span
              className="font-bold text-sm tracking-wide"
              style={{ color: "oklch(0.72 0.19 180)", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              LAVIÉ LABS
            </span>
          </div>
        </Link>

        {/* Nav tabs */}
        <div className="flex items-center gap-1">
          {navItems.map(({ path, label, icon: Icon }) => {
            const active =
              location === path ||
              (path === "/dialler" && location === "/" && isAdmin) ||
              (path === "/training" && location === "/" && !isAdmin);
            return (
              <Link key={path} href={path}>
                <button
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-150",
                    active
                      ? "text-white"
                      : "text-white/50 hover:text-white/80 hover:bg-white/5"
                  )}
                  style={
                    active
                      ? {
                          background: "oklch(0.72 0.19 180 / 0.15)",
                          color: "oklch(0.72 0.19 180)",
                          borderBottom: "2px solid oklch(0.72 0.19 180)",
                          borderRadius: "6px 6px 0 0",
                        }
                      : {}
                  }
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
              className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-white/5 transition-colors"
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ background: "oklch(0.72 0.19 180 / 0.25)", color: "oklch(0.72 0.19 180)" }}
              >
                {initials}
              </div>
              <span className="text-sm text-white/70 max-w-[100px] truncate">{user?.name}</span>
              {isAdmin && <ShieldCheck size={12} className="text-teal-400" />}
              <ChevronDown size={12} className="text-white/40" />
            </button>
          ) : (
            <a
              href={getLoginUrl()}
              className="text-sm px-4 py-1.5 rounded-md font-medium transition-colors"
              style={{ background: "oklch(0.72 0.19 180)", color: "#0F1923" }}
            >
              Sign in
            </a>
          )}

          {menuOpen && (
            <div
              className="absolute right-0 top-full mt-1 w-44 rounded-lg border border-white/10 shadow-xl py-1 z-50"
              style={{ background: "oklch(0.16 0.03 240)" }}
            >
              <div className="px-3 py-2 border-b border-white/10">
                <p className="text-xs text-white/40">Signed in as</p>
                <p className="text-sm text-white/80 truncate">{user?.name}</p>
                {isAdmin && (
                  <span className="inline-flex items-center gap-1 mt-1 text-xs text-teal-400">
                    <ShieldCheck size={10} /> Admin
                  </span>
                )}
              </div>
              <button
                onClick={() => { setMenuOpen(false); logout(); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors"
              >
                <LogOut size={14} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Mobile bottom tab bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-white/10 px-2 py-2"
        style={{ background: "oklch(0.13 0.03 240)" }}
      >
        {navItems.map(({ path, label, icon: Icon }) => {
          const active =
            location === path ||
            (path === "/dialler" && location === "/" && isAdmin) ||
            (path === "/training" && location === "/" && !isAdmin);
          return (
            <Link key={path} href={path}>
              <button
                className={cn(
                  "flex flex-col items-center gap-0.5 px-3 py-1 rounded-md transition-colors",
                  active ? "" : "text-white/40"
                )}
                style={active ? { color: "oklch(0.72 0.19 180)" } : {}}
              >
                <Icon size={20} />
                <span className="text-[10px] font-medium">{label}</span>
              </button>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

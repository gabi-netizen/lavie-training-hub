import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { SignIn, SignUp } from "@clerk/clerk-react";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import AppLayout from "./components/AppLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import CallCoach from "./pages/CallCoach";
import Dialler from "./pages/Dialler";
import Customers from "./pages/Customers";
import ContactCard from "./pages/ContactCard";
import ProfileSettings from "./pages/ProfileSettings";
import CallLog from "./pages/CallLog";
import CallCenterDashboard from "./pages/CallCenterDashboard";
import Workspace from "./pages/Workspace";
import PhoneNumbers from "./pages/PhoneNumbers";
import ManagerDashboard from "./pages/ManagerDashboard";
import SupportTickets from "@/pages/SupportTickets";
import UsersPage from "@/pages/Users";
import OpeningDashboard from "@/pages/OpeningDashboard";
import SharedCallView from "./pages/SharedCallView";
import { useAuth } from "@/_core/hooks/useAuth";
import { lazy, Suspense, useEffect } from "react";

const RetentionWorkspace = lazy(() => import("./pages/RetentionWorkspace"));
const WhatsAppControl = lazy(() => import("@/pages/WhatsAppControl"));

/** Wraps a component so only admins can access it. Non-admins are redirected to /training. */
function AdminRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (loading) return;
    // Not logged in at all — send to sign-in
    if (!user) {
      window.location.href = "/sign-in";
      return;
    }
    // Logged in but not admin — send to training
    if (user.role !== "admin") {
      navigate("/training");
    }
  }, [loading, user, navigate]);

  // While loading auth, show a minimal loading indicator
  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
    </div>
  );
  // If not admin, render nothing (redirect happens via useEffect)
  if (!user || user.role !== "admin") return null;

  return <Component />;
}

/** Wraps a component so admins and retention team members can access it. */
function AdminOrRetentionRoute({ component: Component, componentProps }: { component: React.ComponentType<any>; componentProps?: Record<string, any> }) {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      window.location.href = "/sign-in";
      return;
    }
    // Allow admins and retention team members
    if (user.role !== "admin" && user.team !== "retention") {
      navigate("/training");
    }
  }, [loading, user, navigate]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
    </div>
  );
  if (!user || (user.role !== "admin" && user.team !== "retention")) return null;

  return <Component {...(componentProps || {})} />;
}

/** Wraps a component so only managers (users with no team) can access it. */
function ManagerRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      window.location.href = "/sign-in";
      return;
    }
    // Only users with no team (managers) can access
    if (user.team !== null) {
      navigate("/workspace");
    }
  }, [loading, user, navigate]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
    </div>
  );
  if (!user || user.team !== null) return null;

  return <Component />;
}

/** Redirects the URL to /ai-coach?tab=X then renders CallCoach */
function TabRedirect({ tab }: { tab: string }) {
  useEffect(() => {
    window.history.replaceState(null, "", `/ai-coach?tab=${tab}`);
  }, [tab]);
  return <CallCoach />;
}

function Router() {
  return (
    <AppLayout>
      <Switch>
        {/* Default landing: all users → Call Center Dashboard */}
        <Route path="/" component={CallCenterDashboard} />

        {/* Call Center Dashboard */}
        <Route path="/call-center-dashboard" component={CallCenterDashboard} />

        {/* Dialler — all users */}
        <Route path={"/dialler"} component={Dialler} />

        {/* Contacts CRM — all users (data filtered by role server-side) */}
        <Route path={"/contacts"}>{() => <Customers />}</Route>

        {/* Individual contact card — all users */}
        <Route path={"/contacts/:id"} component={ContactCard} />

        {/* Call Log — all users */}
        <Route path={"/call-log"} component={CallLog} />

        {/* Phone Numbers pool management — admin only */}
        <Route path={"/phone-numbers"}>
          {() => <AdminRoute component={PhoneNumbers} />}
        </Route>

        {/* Training = scripts, objections, cheat sheet — all users */}
        <Route path={"/training"} component={Home} />

        {/* AI Coach = upload + my calls + manager view — all users */}
        <Route path={"/ai-coach"} component={CallCoach} />

        {/* Team and Leaderboard deep-link into CallCoach with the right tab */}
        <Route path={"/team"}>
          {() => <TabRedirect tab="team" />}
        </Route>
        <Route path={"/leaderboard"}>
          {() => <TabRedirect tab="leaderboard" />}
        </Route>

        {/* Manager Command Centre — admin only */}
        <Route path={"/command-centre"}>
          {() => <AdminRoute component={ManagerDashboard} />}
        </Route>

        {/* Support Tickets — admin + retention agents */}
        <Route path={"/support-tickets"}>
          {() => <AdminOrRetentionRoute component={SupportTickets} />}
        </Route>

        {/* WhatsApp Control — all authenticated users */}
        <Route path={"/whatsapp-control"}>
          {() => (
            <Suspense fallback={<div className="flex items-center justify-center min-h-[60vh]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>}>
              <WhatsAppControl />
            </Suspense>
          )}
        </Route>

        {/* Users Management — admin only */}
        <Route path={"/users"}>
          {() => <AdminRoute component={UsersPage} />}
        </Route>

        {/* Opening Agents Dashboard — all authenticated users */}
        <Route path={"/opening-dashboard"} component={OpeningDashboard} />

        {/* Retention Workspace — admin + retention agents */}
        <Route path={"/retention-workspace"}>
          {() => <AdminOrRetentionRoute component={RetentionWorkspace} />}
        </Route>
        <Route path={"/retention-workspace/james"}>
          {() => <AdminOrRetentionRoute component={RetentionWorkspace} componentProps={{ agentName: "James" }} />}
        </Route>
        <Route path={"/retention-workspace/guy"}>
          {() => <AdminOrRetentionRoute component={RetentionWorkspace} componentProps={{ agentName: "Guy" }} />}
        </Route>

        {/* Workspace — agent calling workspace */}
        <Route path={"/workspace"} component={Workspace} />

        {/* Profile settings — all authenticated users */}
        <Route path={"/profile"} component={ProfileSettings} />
        <Route path={"/profile-settings"} component={ProfileSettings} />

        {/* Clerk auth pages — wildcard routes catch sub-paths like /sign-in/factor-one */}
        <Route path="/sign-in/:rest*">
          {() => (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
              <SignIn routing="path" path="/sign-in" />
            </div>
          )}
        </Route>
        <Route path="/sign-in">
          {() => (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
              <SignIn routing="path" path="/sign-in" />
            </div>
          )}
        </Route>
        <Route path="/sign-up/:rest*">
          {() => (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
              <SignUp routing="path" path="/sign-up" />
            </div>
          )}
        </Route>
        <Route path="/sign-up">
          {() => (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
              <SignUp routing="path" path="/sign-up" />
            </div>
          )}
        </Route>

        <Route path={"/404"} component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Switch>
            {/* Public shared call view — NO auth, NO app shell */}
            <Route path="/shared/call/:shareToken/:slug*" component={SharedCallView} />
            {/* Everything else goes through the authenticated app layout */}
            <Route>{() => <Router />}</Route>
          </Switch>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

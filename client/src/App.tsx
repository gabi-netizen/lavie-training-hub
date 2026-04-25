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
import { useAuth } from "@/_core/hooks/useAuth";
import { useEffect } from "react";

/** Wraps a component so only admins can access it. Non-admins are redirected to /training. */
function AdminRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!loading && user && user.role !== "admin") {
      navigate("/training");
    }
  }, [loading, user, navigate]);

  // While loading auth, render nothing (avoids flash)
  if (loading) return null;
  // If not admin, render nothing (redirect happens via useEffect)
  if (!user || user.role !== "admin") return null;

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
  const { user, loading } = useAuth();
  const isAdmin = !loading && user?.role === "admin";

  return (
    <AppLayout>
      <Switch>
        {/* Default landing: all users → Call Center Dashboard */}
        <Route path="/">
          {() => {
            if (loading) return null;
            return <CallCenterDashboard />;
          }}
        </Route>

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
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
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
        {/* Default landing: admins → Dialler, agents → Training */}
        <Route path={"/"}>
          {() => {
            if (loading) return null;
            if (isAdmin) return <Dialler />;
            return <Home />;
          }}
        </Route>

        {/* Admin-only: Dialler */}
        <Route path={"/dialler"}>
          {() => <AdminRoute component={Dialler} />}
        </Route>

        {/* Admin-only: Contacts CRM */}
        <Route path={"/contacts"}>
          {() => <AdminRoute component={Customers} />}
        </Route>

        {/* Admin-only: Individual contact card */}
        <Route path={"/contacts/:id"}>
          {() => <AdminRoute component={ContactCard} />}
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

        {/* Profile settings — all authenticated users */}
        <Route path={"/profile"} component={ProfileSettings} />

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

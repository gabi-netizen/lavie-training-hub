import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import AppLayout from "./components/AppLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import CallCoach from "./pages/CallCoach";
import Dialler from "./pages/Dialler";
import Customers from "./pages/Customers";

function Router() {
  return (
    <AppLayout>
      <Switch>
        {/* Default landing → Dialler */}
        <Route path={"/"} component={Dialler} />
        <Route path={"/dialler"} component={Dialler} />
        {/* Contacts CRM */}
        <Route path={"/contacts"}>{() => <Customers />}</Route>
        {/* Training = the original Home content (scripts, objections, cheat sheet) */}
        <Route path={"/training"} component={Home} />
        {/* AI Coach = upload + my calls + manager view */}
        <Route path={"/ai-coach"} component={CallCoach} />
        {/* Team and Leaderboard deep-link into CallCoach with the right tab */}
        <Route path={"/team"}>
          {() => { window.history.replaceState(null, "", "/ai-coach?tab=team"); return <CallCoach />; }}
        </Route>
        <Route path={"/leaderboard"}>
          {() => { window.history.replaceState(null, "", "/ai-coach?tab=leaderboard"); return <CallCoach />; }}
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
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

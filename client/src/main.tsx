import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { ClerkProvider, useAuth as useClerkAuth } from "@clerk/clerk-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import { useRef } from "react";
import superjson from "superjson";
import App from "./App";
import { CLERK_PUBLISHABLE_KEY, getLoginUrl } from "./const";
import "./index.css";

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

// Inner component that has access to Clerk's getToken.
//
// IMPORTANT: trpcClient MUST be stable across renders — creating it inside
// the component body (without memoisation) causes React 19's concurrent mode
// to throw "Should not already be working" and tRPC to throw
// "client[procedureType] is not a function" because the client is torn down
// and rebuilt mid-render cycle.
//
// Fix: create the client once with useRef. Store getToken in a separate ref
// so the stable client always calls the latest token getter.
function AppWithTrpc() {
  const { getToken } = useClerkAuth();

  // Keep getToken ref up-to-date without recreating the tRPC client.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  // Create the tRPC client exactly once for the lifetime of this component.
  const trpcClientRef = useRef<ReturnType<typeof trpc.createClient> | null>(null);
  if (!trpcClientRef.current) {
    trpcClientRef.current = trpc.createClient({
      links: [
        httpBatchLink({
          url: "/api/trpc",
          transformer: superjson,
          async headers() {
            try {
              const token = await getTokenRef.current();
              if (token) return { Authorization: `Bearer ${token}` };
            } catch {
              // not signed in yet — send request without auth header
            }
            return {};
          },
          fetch(input, init) {
            return globalThis.fetch(input, {
              ...(init ?? {}),
              credentials: "include",
            });
          },
        }),
      ],
    });
  }

  return (
    <trpc.Provider client={trpcClientRef.current} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </trpc.Provider>
  );
}

createRoot(document.getElementById("root")!).render(
  <ClerkProvider
    publishableKey={CLERK_PUBLISHABLE_KEY}
    signInUrl="https://caring-duck-98.accounts.dev/sign-in"
    signUpUrl="https://caring-duck-98.accounts.dev/sign-up"
    afterSignOutUrl="https://caring-duck-98.accounts.dev/sign-in"
  >
    <AppWithTrpc />
  </ClerkProvider>
);

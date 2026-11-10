import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./styles.css";
import { Layout } from "./components/Layout.tsx";
import { ToastProvider } from "./components/toast.tsx";
import { WalletProvider } from "./lib/wallet.tsx";
import Home from "./pages/Home.tsx";

const Arcade = lazy(() => import("./pages/Arcade.tsx"));
const Token = lazy(() => import("./pages/Token.tsx"));
const Launch = lazy(() => import("./pages/Launch.tsx"));
const Rewards = lazy(() => import("./pages/Rewards.tsx"));
const Feed = lazy(() => import("./pages/Feed.tsx"));
const Portfolio = lazy(() => import("./pages/Portfolio.tsx"));
const Rules = lazy(() => import("./pages/Rules.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

const page = (el: React.ReactNode) => <Suspense fallback={<div className="min-h-[60vh]" />}>{el}</Suspense>;

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/arcade", element: page(<Arcade />) },
      { path: "/token/:address", element: page(<Token />) },
      { path: "/launch", element: page(<Launch />) },
      { path: "/rewards", element: page(<Rewards />) },
      { path: "/rewards/:address", element: page(<Rewards />) },
      { path: "/feed", element: page(<Feed />) },
      { path: "/portfolio", element: page(<Portfolio />) },
      { path: "/portfolio/:address", element: page(<Portfolio />) },
      { path: "/rules", element: page(<Rules />) },
      { path: "*", element: page(<NotFound />) },
    ],
  },
]);

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: true, retry: 1 } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <WalletProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </WalletProvider>
    </QueryClientProvider>
  </StrictMode>,
);

import { useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';
import { Toaster } from 'react-hot-toast';

// Import pages
import Dashboard from './pages/Dashboard';
import ChatInterface from './pages/ChatInterface';
import AgentManager from './pages/AgentManager';
import EventMonitor from './pages/EventMonitor';
import Settings from './pages/Settings';
import DialectDashboard from './pages/DialectDashboard';
import DialectAuth from './pages/DialectAuth';
import DialectNotifications from './pages/DialectNotifications';
import DialectBlinks from './pages/DialectBlinks';
import DialectMCP from './pages/DialectMCP';
import Executions from './pages/Executions';

// Import components
import Layout from './components/Layout';
import ThemeProvider from './components/ThemeProvider';
import ErrorBoundary from './components/ErrorBoundary';

// Import styles
import '@solana/wallet-adapter-react-ui/styles.css';

// Create a client for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

function App() {
  // The network can be set to 'devnet', 'testnet', or 'mainnet-beta'
  const network = WalletAdapterNetwork.Devnet;

  // You can also provide a custom RPC endpoint
  const endpoint = useMemo(() => clusterApiUrl(network), [network]);

  const wallets = useMemo(
    () => [
      new SolflareWalletAdapter(),
      // Phantom is auto-registered, no need to include it explicitly
    ],
    []
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider wallets={wallets} autoConnect>
          <WalletModalProvider>
            <ThemeProvider>
              <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <ErrorBoundary>
                  <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
                    <Layout>
                      <Routes>
                      {/* Main Routes */}
                      <Route path="/" element={<Navigate to="/dashboard" replace />} />
                      <Route path="/dashboard" element={<Dashboard />} />
                      <Route path="/chat" element={<ChatInterface />} />
                      <Route path="/agents" element={<AgentManager />} />
                      <Route path="/events" element={<EventMonitor />} />
                      <Route path="/executions" element={<Executions />} />
                      <Route path="/dialect" element={<DialectDashboard />} />
                      <Route path="/dialect/auth" element={<DialectAuth />} />
                      <Route path="/dialect/notifications" element={<DialectNotifications />} />
                      <Route path="/dialect/blinks" element={<DialectBlinks />} />
                      <Route path="/dialect/mcp" element={<DialectMCP />} />
                      <Route path="/settings" element={<Settings />} />

                      {/* Catch all route */}
                        <Route path="*" element={<Navigate to="/dashboard" replace />} />
                      </Routes>
                    </Layout>

                    {/* Toast notifications */}
                    <Toaster
                      position="top-right"
                      toastOptions={{
                        duration: 4000,
                        className: 'dark:bg-gray-800 dark:text-white',
                        style: {
                          background: 'var(--toast-bg)',
                          color: 'var(--toast-color)',
                        },
                      }}
                    />
                  </div>
                </ErrorBoundary>
              </Router>
            </ThemeProvider>
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </QueryClientProvider>
  );
}

export default App;

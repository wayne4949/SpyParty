import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { LangProvider } from '@/lib/LangContext';
import GlobalNavBar from '@/components/GlobalNavBar';
import Home from './pages/Home';
import Game from './pages/Game';

function App() {
  return (
    <LangProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <GlobalNavBar />
          <Routes>
            <Route path="/" element={<Navigate to="/Home" replace />} />
            <Route path="/Home" element={<Home />} />
            <Route path="/Game" element={<Game />} />
            <Route path="*" element={<PageNotFound />} />
          </Routes>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </LangProvider>
  );
}

export default App;

import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Masthead } from './Masthead';
import { Footer } from './Footer';
import { Banner } from '@/components/ui/Banner';
import { Menu } from 'lucide-react';

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (sidebarOpen) {
      document.body.classList.add('menu-open');
    } else {
      document.body.classList.remove('menu-open');
    }
    return () => {
      document.body.classList.remove('menu-open');
    };
  }, [sidebarOpen]);

  return (
    <div className="flex flex-col min-h-screen bg-white">
      <Masthead />
      <Banner />

      {/* Mobile Header with hamburger */}
      <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b-2 border-neutral-300">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition-all"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="Logo" className="w-5 h-5" />
          <span className="text-[13px] font-semibold text-neutral-900">Contravention</span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="flex-1 overflow-auto bg-grid">
          <Outlet />
        </main>
      </div>
      <Footer />
    </div>
  );
}

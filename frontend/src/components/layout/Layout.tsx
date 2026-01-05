import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Masthead } from './Masthead';
import { Footer } from './Footer';

export function Layout() {
  return (
    <div className="flex flex-col min-h-screen">
      <Masthead />
      <div className="flex flex-1 bg-gray-50">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
      <Footer />
    </div>
  );
}

import React from 'react';
import { Navbar } from './Navbar';
import { SchedulerChat } from '../scheduler/SchedulerChat';

interface LayoutProps {
  children: React.ReactNode;
}

const MARQUEE_TEXT = '🚧 MaidLink is currently in private beta — live booking is not yet available. We\'re working hard to launch soon. Stay tuned! · ';

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#FBF7EE' }}>
      <div className="bg-amber-400 text-amber-900 text-sm font-medium py-2 overflow-hidden whitespace-nowrap">
        <div className="inline-block animate-marquee">
          {MARQUEE_TEXT.repeat(6)}
        </div>
      </div>
      <Navbar />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
      <footer className="border-t border-brand-200 py-6 text-center text-sm text-brand-500">
        © {new Date().getFullYear()} MaidLink · Calgary Home Cleaning
      </footer>
      <SchedulerChat />
    </div>
  );
}

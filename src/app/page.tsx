"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Code2, ShieldCheck, Zap, Layers, Plus, Terminal, CheckCircle2 } from 'lucide-react';
import { FloatingIconsHero } from "@/components/ui/floating-icons-hero-section";
import Link from 'next/link';

const GithubIcon = ({ size = 20, className = "" }: { size?: number, className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.2c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"></path>
    <path d="M9 18c-4.51 2-5-2-7-2"></path>
  </svg>
);

const saasDomains = [
  { domain: "salesforce.com", className: 'top-[12%] left-[10%]' },
  { domain: "shopify.com", className: 'top-[22%] right-[12%]' },
  { domain: "quickbooks.intuit.com", className: 'top-[80%] left-[15%]' },
  { domain: "hubspot.com", className: 'bottom-[12%] right-[15%]' },
  { domain: "zendesk.com", className: 'top-[5%] left-[45%]' },
  { domain: "atlassian.com", className: 'top-[45%] left-[8%]' },
  { domain: "slack.com", className: 'top-[45%] right-[8%]' },
  { domain: "stripe.com", className: 'bottom-[15%] left-[35%]' },
  { domain: "contaazul.com", className: 'top-[65%] right-[25%]' },
  { domain: "omie.com.br", className: 'top-[28%] left-[28%]' },
  { domain: "vtex.com", className: 'top-[28%] right-[28%]' },
  { domain: "nuvemshop.com.br", className: 'bottom-[5%] left-[55%]' },
];

const demoIcons = saasDomains.map((item, index) => ({
  id: index + 1,
  domain: item.domain,
  className: item.className
}));

const GITHUB_URL = "https://github.com/pingadodigital/openipaas";

const CodeComparison = () => {
  const [view, setView] = useState<'raw' | 'unified'>('raw');

  const rawData = `{
  "sfdc_id": "001D000000I8mU0",
  "company_legal_name": "Acme Corp",
  "TaxId__c": "US-987654321",
  "account_type": "B2B",
  "status_code": 1
}`;

  const unifiedData = `{
  "id": "001D000000I8mU0",
  "name": "Acme Corp",
  "document": "US-987654321",
  "personType": "LEGAL",
  "status": "ACTIVE",
  "remoteData": {
    "provider": "SALESFORCE",
    "raw": { ... }
  }
}`;

  return (
    <div className="bg-slate-900/80 backdrop-blur-sm rounded-xl border border-slate-800 overflow-hidden mt-8 shadow-2xl">
      <div className="flex border-b border-slate-800 bg-slate-900/50">
        <button 
          onClick={() => setView('raw')}
          className={`px-4 py-2 text-xs font-medium transition-all duration-300 ${view === 'raw' ? 'bg-slate-800 text-highlight border-b-2 border-highlight' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Raw Provider Data
        </button>
        <button 
          onClick={() => setView('unified')}
          className={`px-4 py-2 text-xs font-medium transition-all duration-300 ${view === 'unified' ? 'bg-slate-800 text-highlight border-b-2 border-highlight' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Open IpaaS (Unified)
        </button>
      </div>
      <div className="p-4 min-h-[160px] relative">
        <AnimatePresence mode="wait">
          <motion.pre 
            key={view}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            className="text-xs md:text-sm font-mono leading-relaxed"
          >
            <code className="text-highlight/90">
              {view === 'raw' ? (
                <span className="text-slate-400">
                  {rawData}
                </span>
              ) : (
                <span className="text-highlight">
                  {unifiedData}
                </span>
              )}
            </code>
          </motion.pre>
        </AnimatePresence>
      </div>
    </div>
  );
};

interface FeatureCardProps {
  icon: React.ElementType;
  title: string;
  description: string;
  children?: React.ReactNode;
  className?: string;
}

const FeatureCard = ({ icon: Icon, title, description, children, className = "" }: FeatureCardProps) => (
  <motion.div 
    whileHover={{ y: -5 }}
    className={`bg-slate-900/40 backdrop-blur-md border border-slate-800/50 p-8 rounded-3xl relative overflow-hidden group hover:border-highlight/30 transition-colors duration-500 ${className}`}
  >
    <div className="relative z-10">
      <div className="w-10 h-10 rounded-lg bg-highlight/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500">
        <Icon className="text-highlight" size={20} />
      </div>
      <h3 className="text-2xl font-bold text-white tracking-tight">{title}</h3>
      <p className="text-slate-400 mt-3 leading-relaxed">{description}</p>
      {children}
    </div>
    <div className="absolute top-0 right-0 w-32 h-32 bg-highlight/5 blur-[60px] rounded-full group-hover:bg-highlight/10 transition-colors duration-700" />
  </motion.div>
);

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-highlight/30 relative overflow-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex justify-between items-center px-6 py-8 max-w-7xl mx-auto backdrop-blur-sm">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-xl font-bold tracking-tighter text-white flex items-center gap-2.5"
        >
          <img src="/logo.png" alt="Open IpaaS Logo" className="h-8 w-auto" />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">Open IpaaS</span>
        </motion.div>
        
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex gap-8 items-center"
        >
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-white transition-colors">
            <GithubIcon size={20} />
          </a>
          <Link href={GITHUB_URL} className="relative group bg-white text-black px-6 py-2.5 rounded-full text-sm font-semibold hover:bg-slate-100 transition-all duration-300 active:scale-95 overflow-hidden">
            <span className="relative z-10">Get Started</span>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
          </Link>
        </motion.div>
      </nav>

      {/* Floating Hero Section */}
      <FloatingIconsHero
        title={
          <>
            Stop fighting <br />
            <span className="text-highlight font-serif italic pr-2">B2B APIs.</span>
            Start building.
          </>
        }
        subtitle={
          <>
            The open-source framework to unify global B2B platforms under a single, strongly-typed English-first API. 
            <span className="text-slate-300 block mt-2">Enterprise-grade integrations, democratized.</span>
          </>
        }
        ctaText="Start Developing"
        ctaHref={GITHUB_URL}
        icons={demoIcons}
        className="bg-slate-950"
      />

      {/* Main Content */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 pb-40 -mt-20">
        {/* Bento Grid */}
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8 }}
          className="mt-20 grid grid-cols-1 md:grid-cols-12 gap-6"
        >
          {/* Main Feature */}
          <FeatureCard 
            className="md:col-span-8"
            icon={Code2}
            title="Unified Data Model"
            description="Forget about mapping 'sfdc_id', 'cnpj_cpf', or 'custom_field_89'. Work with normalized English objects that work seamlessly across any SaaS provider."
          >
            <CodeComparison />
          </FeatureCard>

          {/* Validation Shield */}
          <FeatureCard 
            className="md:col-span-4"
            icon={ShieldCheck}
            title="Zod Shield"
            description="Real-time runtime validation. If the upstream platform's data structure changes, our shield blocks it."
          >
            <div className="mt-10 p-5 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl">
              <div className="flex justify-between items-center mb-4">
                <div className="flex gap-2 items-center text-xs font-semibold text-emerald-400">
                  <CheckCircle2 size={14} /> Schema Validated
                </div>
                <span className="text-[10px] text-emerald-500 font-mono">100% MATCH</span>
              </div>
              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  whileInView={{ width: "100%" }}
                  transition={{ duration: 1.5, ease: "easeOut" }}
                  className="h-full bg-emerald-500" 
                />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="h-1 bg-emerald-500/20 rounded" />
                <div className="h-1 bg-emerald-500/20 rounded" />
              </div>
            </div>
          </FeatureCard>

          {/* Setup */}
          <FeatureCard 
            className="md:col-span-4"
            icon={Zap}
            title="Zero-Config Setup"
            description="Spin up the entire environment (DB + Migrations + API + Seed Data) with a single command."
          >
            <div className="mt-10 font-mono text-[11px] p-5 bg-black/50 backdrop-blur-sm rounded-2xl border border-slate-800 group-hover:border-highlight/30 transition-colors">
              <div className="flex items-center gap-2 mb-2 text-slate-500 border-b border-slate-800 pb-2">
                <Terminal size={12} /> terminal · bash
              </div>
              <span className="text-highlight">$</span> docker-compose up --build
              <motion.div 
                animate={{ opacity: [1, 0] }}
                transition={{ repeat: Infinity, duration: 0.8 }}
                className="inline-block w-1.5 h-3 bg-slate-500 ml-1 translate-y-0.5"
              />
            </div>
          </FeatureCard>

          {/* Architecture */}
          <FeatureCard 
            className="md:col-span-8 flex flex-col md:flex-row items-start gap-12"
            icon={Layers}
            title="Universal Plugin Architecture"
            description="Adding a new integration is as simple as generating a file via CLI and implementing a standard interface. Built to scale."
          >
            <div className="mt-4 md:mt-0 flex-1 w-full">
              <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800/50 w-full max-w-xs ml-auto shadow-inner">
                 <div className="flex flex-col gap-4">
                    {[
                      { name: 'Salesforce', color: 'bg-blue-500' },
                      { name: 'Shopify', color: 'bg-green-500' },
                      { name: 'QuickBooks', color: 'bg-indigo-500' }
                    ].map((provider) => (
                      <div key={provider.name} className="flex items-center justify-between group/item">
                        <div className="flex items-center gap-3 text-sm">
                          <div className={`w-2.5 h-2.5 ${provider.color} rounded-full shadow-[0_0_10px_rgba(0,0,0,0.5)]`} /> 
                          <span className="text-slate-300 group-hover/item:text-white transition-colors">{provider.name}</span>
                        </div>
                        <CheckCircle2 size={14} className="text-emerald-500 opacity-0 group-hover/item:opacity-100 transition-opacity" />
                      </div>
                    ))}
                    <Link href="/docs" className="pt-2 border-t border-slate-800 flex items-center gap-3 text-xs italic text-slate-500 cursor-pointer hover:text-highlight transition-colors group/add">
                       <Plus size={14} className="group-hover/add:rotate-90 transition-transform" /> 
                       <span>Add your own plugin</span>
                    </Link>
                 </div>
              </div>
            </div>
          </FeatureCard>
        </motion.div>

        {/* Footer CTAs */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-40 text-center"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-8 tracking-tight">Ready to unify your stack?</h2>
          <div className="flex flex-wrap justify-center gap-4">
             <Link href="/docs" className="bg-white text-black px-12 py-4 rounded-full font-bold hover:bg-slate-100 transition-all shadow-2xl shadow-white/5 active:scale-95">
                Join the Beta
             </Link>
             <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="bg-transparent border border-slate-800 text-white px-12 py-4 rounded-full font-bold hover:bg-slate-900 transition-all active:scale-95">
                Star on GitHub
             </a>
          </div>
        </motion.div>
      </main>

      <footer className="relative z-10 border-t border-slate-900 py-12 flex flex-col items-center gap-4 text-center text-slate-500 text-sm">
        <img src="/logo.png" alt="Open IpaaS Logo" className="h-6 w-auto grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all duration-500" />
        <p>&copy; {new Date().getFullYear()} Open IpaaS. Released under MIT License.</p>
      </footer>
    </div>
  );
}

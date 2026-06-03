import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Layout } from '../components/layout/Layout';
import { EstimatorWidget } from '../components/estimator/EstimatorWidget';
import { LiveEstimatorFlow } from '../components/live-estimator/LiveEstimatorFlow';

type Mode = 'photo' | 'live';

export function EstimatorPage() {
  const [mode, setMode] = useState<Mode>('photo');

  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <Layout hideChat>
      <Helmet>
        <title>Free Cleaning Estimate — MaidLink Calgary</title>
        <meta name="description" content="Get a free AI-powered home cleaning estimate in 2 minutes. Upload photos or enter your home details — standard, deep, or move-out cleaning in Calgary." />
        <meta property="og:title" content="Free Cleaning Estimate — MaidLink Calgary" />
        <meta property="og:description" content="Get a free AI-powered home cleaning estimate in 2 minutes. No sign-up needed." />
        <meta property="og:url" content="https://maidlink.ca/estimate" />
        <link rel="canonical" href="https://maidlink.ca/estimate" />
      </Helmet>

      {/* Mode picker */}
      <div className="max-w-2xl mx-auto px-4 pt-8 pb-2">
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setMode('photo')}
            className={`rounded-xl border-2 p-4 text-left transition-colors ${
              mode === 'photo'
                ? 'border-teal-600 bg-teal-50'
                : 'border-gray-200 bg-white hover:border-teal-300 hover:bg-teal-50/50'
            }`}
          >
            <p className={`text-sm font-semibold ${mode === 'photo' ? 'text-teal-800' : 'text-gray-800'}`}>
              Photo Upload
            </p>
            <p className={`text-xs mt-1 ${mode === 'photo' ? 'text-teal-600' : 'text-gray-500'}`}>
              Upload room photos and get a detailed AI analysis
            </p>
            {mode === 'photo' && (
              <span className="mt-2 inline-block text-xs bg-teal-600 text-white px-2 py-0.5 rounded-full">Selected</span>
            )}
          </button>

          <button
            onClick={() => setMode('live')}
            className={`rounded-xl border-2 p-4 text-left transition-colors ${
              mode === 'live'
                ? 'border-teal-600 bg-teal-50'
                : 'border-gray-200 bg-white hover:border-teal-300 hover:bg-teal-50/50'
            }`}
          >
            <p className={`text-sm font-semibold ${mode === 'live' ? 'text-teal-800' : 'text-gray-800'}`}>
              Live Video
            </p>
            <p className={`text-xs mt-1 ${mode === 'live' ? 'text-teal-600' : 'text-gray-500'}`}>
              Walk through your home on camera — AI guides you in real time
            </p>
            {mode === 'live'
              ? <span className="mt-2 inline-block text-xs bg-teal-600 text-white px-2 py-0.5 rounded-full">Selected</span>
              : <span className="mt-2 inline-block text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Try it</span>
            }
          </button>
        </div>
      </div>

      {mode === 'photo' && <EstimatorWidget />}
      {mode === 'live'  && (
        <div className="max-w-5xl mx-auto px-4 pb-12">
          <LiveEstimatorFlow onBack={() => setMode('photo')} />
        </div>
      )}
    </Layout>
  );
}

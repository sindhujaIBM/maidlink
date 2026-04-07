import { Helmet } from 'react-helmet-async';
import { Layout } from '../components/layout/Layout';
import { EstimatorWidget } from '../components/estimator/EstimatorWidget';

export function EstimatorPage() {
  return (
    <Layout>
      <Helmet>
        <title>Free Cleaning Estimate — MaidLink Calgary</title>
        <meta name="description" content="Get a free AI-powered home cleaning estimate in 2 minutes. Upload photos or enter your home details — standard, deep, or move-out cleaning in Calgary." />
        <meta property="og:title" content="Free Cleaning Estimate — MaidLink Calgary" />
        <meta property="og:description" content="Get a free AI-powered home cleaning estimate in 2 minutes. No sign-up needed." />
        <meta property="og:url" content="https://maidlink.ca/estimate" />
        <link rel="canonical" href="https://maidlink.ca/estimate" />
      </Helmet>
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Free Calgary Cleaning Estimate</h1>
          <p className="text-gray-500 text-sm mt-1">
            Get an AI-powered estimate for house cleaning in Calgary — standard, deep, or move-out. No sign-up needed.
          </p>
        </div>
        <EstimatorWidget />
      </div>
    </Layout>
  );
}

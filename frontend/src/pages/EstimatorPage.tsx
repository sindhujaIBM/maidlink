import { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Layout } from '../components/layout/Layout';
import { EstimatorWidget } from '../components/estimator/EstimatorWidget';

export function EstimatorPage() {
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
      <EstimatorWidget />
    </Layout>
  );
}

import { Layout } from '../components/layout/Layout';
import { EstimatorWidget } from '../components/estimator/EstimatorWidget';

export function EstimatorPage() {
  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Cleaning Time Estimator</h1>
          <p className="text-gray-500 text-sm mt-1">
            Quickly estimate how long your cleaning will take based on your home details.
          </p>
        </div>
        <EstimatorWidget />
      </div>
    </Layout>
  );
}

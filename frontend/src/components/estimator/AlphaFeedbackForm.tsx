import { useState } from 'react';
import { submitAlphaFeedback } from '../../api/feedback';

const QUESTIONS = [
  { id: 'confusingPart',    label: 'What was the most confusing or frustrating part of the flow?',       required: true  },
  { id: 'estimateAccuracy', label: 'Did the estimate feel accurate for your home? What felt off?',        required: true  },
  { id: 'oneChange',        label: 'What one change would most improve the experience?',                   required: true  },
  { id: 'anythingElse',     label: 'Anything else you\'d like us to know?',                               required: false },
] as const;

type QuestionId = typeof QUESTIONS[number]['id'];

export function AlphaFeedbackForm() {
  const [rating, setRating]             = useState(0);
  const [hovered, setHovered]           = useState(0);
  const [answers, setAnswers]           = useState<Record<QuestionId, string>>({
    confusingPart: '', estimateAccuracy: '', oneChange: '', anythingElse: '',
  });
  const [submitting, setSubmitting]     = useState(false);
  const [submitted, setSubmitted]       = useState(false);
  const [error, setError]               = useState<string | null>(null);

  function setAnswer(id: QuestionId, value: string) {
    setAnswers(prev => ({ ...prev, [id]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating === 0 || !answers.confusingPart.trim() || !answers.estimateAccuracy.trim() || !answers.oneChange.trim()) {
      setError('Please answer questions 1–4 before submitting.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await submitAlphaFeedback({
        overallRating:    rating as 1 | 2 | 3 | 4 | 5,
        confusingPart:    answers.confusingPart.trim(),
        estimateAccuracy: answers.estimateAccuracy.trim(),
        oneChange:        answers.oneChange.trim(),
        anythingElse:     answers.anythingElse.trim(),
      });
      setSubmitted(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="card text-center py-8 space-y-2">
        <div className="text-4xl">🙏</div>
        <p className="font-semibold text-gray-800">Thanks for your feedback!</p>
        <p className="text-sm text-gray-500">
          This goes directly to our team and helps us improve the estimator.
        </p>
      </div>
    );
  }

  return (
    <div className="card space-y-5">
      <div>
        <h3 className="font-semibold text-gray-800 text-base">Share Your Alpha Feedback</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          You're one of the first to try this — your feedback shapes what we build next.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Q1 — Star rating */}
        <div>
          <label className="label mb-2">Overall, how would you rate your experience?</label>
          <div className="flex gap-1" onMouseLeave={() => setHovered(0)}>
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                type="button"
                aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`}
                onMouseEnter={() => setHovered(n)}
                onClick={() => setRating(n)}
                className="text-2xl leading-none focus:outline-none transition-colors"
              >
                <span className={(hovered || rating) >= n ? 'text-amber-400' : 'text-gray-300'}>
                  ★
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Q2–Q5 — Open-ended text areas */}
        {QUESTIONS.map(({ id, label, required }) => (
          <div key={id}>
            <label className="label mb-1">
              {label}
              {!required && <span className="text-gray-400 font-normal ml-1">(optional)</span>}
            </label>
            <textarea
              rows={3}
              maxLength={2000}
              value={answers[id]}
              onChange={e => setAnswer(id, e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none"
            />
          </div>
        ))}

        {error && (
          <p className="text-sm text-red-600 font-medium">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="btn-primary w-full disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting ? 'Submitting…' : 'Submit Feedback'}
        </button>
      </form>
    </div>
  );
}

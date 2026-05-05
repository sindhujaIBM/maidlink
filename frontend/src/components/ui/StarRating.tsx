interface StarRatingProps {
  rating: number;        // 0–5, supports decimals for display
  max?: number;
  size?: 'sm' | 'md';
  interactive?: false;
}

interface InteractiveStarRatingProps {
  rating: number;
  max?: number;
  size?: 'sm' | 'md';
  interactive: true;
  onChange: (rating: number) => void;
}

type Props = StarRatingProps | InteractiveStarRatingProps;

const sizeClasses = { sm: 'h-3.5 w-3.5', md: 'h-5 w-5' };

export function StarRating(props: Props) {
  const { rating, max = 5, size = 'sm' } = props;
  const interactive = props.interactive === true;

  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }, (_, i) => {
        const filled = i < Math.round(rating);
        const svg = (
          <svg
            viewBox="0 0 20 20"
            fill={filled ? '#f59e0b' : 'none'}
            stroke={filled ? '#f59e0b' : '#d1d5db'}
            strokeWidth="1.5"
            className="w-full h-full"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
            />
          </svg>
        );
        return interactive ? (
          <button
            key={i}
            type="button"
            onClick={() => (props as InteractiveStarRatingProps).onChange(i + 1)}
            className={`${sizeClasses[size]} cursor-pointer hover:scale-110 transition-transform`}
            aria-label={`Rate ${i + 1} star${i + 1 > 1 ? 's' : ''}`}
          >{svg}</button>
        ) : (
          <span key={i} className={sizeClasses[size]} aria-hidden="true">{svg}</span>
        );
      })}
    </div>
  );
}

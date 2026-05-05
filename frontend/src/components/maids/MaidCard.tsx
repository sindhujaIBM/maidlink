import { Link } from 'react-router-dom';
import type { MaidListItem } from '../../api/users';
import { StarRating } from '../ui/StarRating';
import { VerifiedBadge } from '../ui/VerifiedBadge';

interface MaidCardProps {
  maid: MaidListItem;
  detailLink?: string;
}

export function MaidCard({ maid, detailLink }: MaidCardProps) {
  const rate = parseFloat(maid.hourlyRate).toFixed(2);
  const avatar = maid.photoUrl || maid.user.avatarUrl;
  const avgRating = parseFloat(maid.avgRating);
  const link = detailLink ?? `/maids/${maid.id}`;

  return (
    <Link to={link} className="block card hover:shadow-md transition-shadow no-underline">
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="flex-shrink-0">
          {avatar
            ? <img src={avatar} alt={maid.user.fullName} className="h-16 w-16 rounded-full object-cover" />
            : (
              <div className="h-16 w-16 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xl font-bold">
                {maid.user.fullName[0]}
              </div>
            )
          }
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900">{maid.user.fullName}</h3>
            {maid.isVerified && <VerifiedBadge />}
          </div>
          {maid.bio && <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{maid.bio}</p>}

          <div className="mt-2 flex items-center gap-1.5">
            <StarRating rating={avgRating} size="sm" />
            <span className="text-xs text-gray-500">
              {avgRating > 0
                ? `${avgRating.toFixed(1)} (${maid.reviewCount})`
                : 'No reviews yet'}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-600">
            <span className="font-semibold text-brand-700 text-sm">${rate}/hr</span>
            <span>·</span>
            <span>{maid.yearsExperience} yr{maid.yearsExperience !== 1 ? 's' : ''} exp</span>
            <span>·</span>
            <span>{maid.serviceAreaCodes.slice(0, 3).join(', ')}
              {maid.serviceAreaCodes.length > 3 ? ' +more' : ''}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <span className="btn-primary text-sm px-4 py-1.5">View Profile</span>
      </div>
    </Link>
  );
}

interface Props {
  rooms:            string[];
  currentRoomIndex: number;
  completedRooms:   string[];
}

export function RoomProgress({ rooms, currentRoomIndex, completedRooms }: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Room Progress</p>
      <div className="space-y-2">
        {rooms.map((room, i) => {
          const isDone    = completedRooms.includes(room);
          const isCurrent = i === currentRoomIndex && !isDone;

          return (
            <div key={room} className="flex items-center gap-2.5">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                isDone    ? 'bg-teal-500' :
                isCurrent ? 'bg-teal-100 border-2 border-teal-500' :
                            'bg-gray-100 border border-gray-200'
              }`}>
                {isDone    && <span className="text-white text-xs">✓</span>}
                {isCurrent && <span className="w-2 h-2 bg-teal-500 rounded-full animate-pulse" />}
              </div>
              <span className={`text-sm transition-colors ${
                isDone    ? 'text-teal-700 line-through decoration-teal-300' :
                isCurrent ? 'text-gray-900 font-medium' :
                            'text-gray-400'
              }`}>
                {room}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

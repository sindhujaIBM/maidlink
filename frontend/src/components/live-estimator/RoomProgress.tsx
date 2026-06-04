interface Props {
  rooms:          string[];
  currentRoom:    string | null;
  completedRooms: string[];
  onSelectRoom?:  (room: string) => void;
}

export function RoomProgress({ rooms, currentRoom, completedRooms, onSelectRoom }: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Room Progress</p>
      <div className="space-y-2">
        {rooms.map(room => {
          const isDone    = completedRooms.includes(room);
          const isCurrent = room === currentRoom;
          const isPending = !isDone && !isCurrent;

          return (
            <button
              key={room}
              type="button"
              disabled={isDone || isCurrent}
              onClick={() => !isDone && !isCurrent && onSelectRoom?.(room)}
              className={`w-full flex items-center gap-2.5 text-left rounded-lg px-1 py-0.5 transition-colors ${
                isPending && onSelectRoom ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'
              }`}
            >
              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                isDone    ? 'bg-teal-500' :
                isCurrent ? 'bg-teal-100 border-2 border-teal-500' :
                            'bg-gray-100 border border-gray-200'
              }`}>
                {isDone    && <span className="text-white text-xs">✓</span>}
                {isCurrent && <span className="w-2 h-2 bg-teal-500 rounded-full animate-pulse" />}
              </div>
              <div className="flex-1 min-w-0">
                <span className={`text-sm transition-colors ${
                  isDone    ? 'text-teal-700 line-through decoration-teal-300' :
                  isCurrent ? 'text-gray-900 font-medium' :
                              'text-gray-500'
                }`}>
                  {room}
                </span>
                {isPending && onSelectRoom && (
                  <span className="block text-xs text-gray-400">tap to scan</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

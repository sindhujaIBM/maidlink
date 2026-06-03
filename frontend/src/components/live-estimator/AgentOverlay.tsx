import { useEffect, useRef } from 'react';

interface Props {
  text:       string;
  isStreaming: boolean;
  currentRoom: string;
  frameCount:  number;
}

export function AgentOverlay({ text, isStreaming, currentRoom, frameCount }: Props) {
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (textRef.current) {
      textRef.current.scrollTop = textRef.current.scrollHeight;
    }
  }, [text]);

  return (
    <div className="absolute inset-x-0 bottom-0 p-4 pointer-events-none">
      {/* Current room label */}
      <div className="flex items-center justify-between mb-2">
        <span className="bg-black/60 text-white text-xs font-medium px-3 py-1 rounded-full backdrop-blur-sm">
          {currentRoom}
        </span>
        <span className="bg-black/60 text-white text-xs px-3 py-1 rounded-full backdrop-blur-sm">
          {frameCount} frames analysed
        </span>
      </div>

      {/* AI guidance bubble */}
      {text && (
        <div className="bg-black/75 backdrop-blur-sm rounded-2xl p-4 max-h-28 overflow-hidden">
          <div className="flex items-start gap-2">
            <div className="shrink-0 w-6 h-6 bg-teal-500 rounded-full flex items-center justify-center mt-0.5">
              <span className="text-white text-xs font-bold">AI</span>
            </div>
            <div
              ref={textRef}
              className="text-white text-sm leading-relaxed overflow-y-auto max-h-20 flex-1"
            >
              {text}
              {isStreaming && (
                <span className="inline-block w-1.5 h-4 bg-teal-400 ml-0.5 animate-pulse align-middle" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

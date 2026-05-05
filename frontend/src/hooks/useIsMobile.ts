import { useState, useEffect } from 'react';

export function useIsMobile(bp = 768) {
  const [mobile, setMobile] = useState(() => window.innerWidth < bp);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const fn = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setMobile(window.innerWidth < bp), 150);
    };
    window.addEventListener('resize', fn);
    return () => { window.removeEventListener('resize', fn); clearTimeout(timer); };
  }, [bp]);
  return mobile;
}

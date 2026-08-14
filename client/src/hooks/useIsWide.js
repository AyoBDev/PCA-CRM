import { useEffect, useState } from 'react';

export function useIsWide(minWidth = 900) {
    const [wide, setWide] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= minWidth : true));
    useEffect(() => {
        const onResize = () => setWide(window.innerWidth >= minWidth);
        onResize();
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [minWidth]);
    return wide;
}

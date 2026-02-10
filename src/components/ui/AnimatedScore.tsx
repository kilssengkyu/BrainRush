import { useEffect, useRef, useState } from 'react';

interface AnimatedScoreProps {
    value: number;
    duration?: number; // animation duration in ms
    className?: string;
}

export const AnimatedScore = ({ value, duration = 300, className = '' }: AnimatedScoreProps) => {
    const [displayValue, setDisplayValue] = useState(value);
    const animationRef = useRef<number>(0);
    const startValueRef = useRef(value);
    const startTimeRef = useRef(0);

    useEffect(() => {
        // If jumping to 0 (round reset), snap instantly
        if (value === 0) {
            setDisplayValue(0);
            startValueRef.current = 0;
            return;
        }

        const startValue = displayValue;
        startValueRef.current = startValue;
        startTimeRef.current = performance.now();

        const animate = (currentTime: number) => {
            const elapsed = currentTime - startTimeRef.current;
            const progress = Math.min(elapsed / duration, 1);

            // Ease-out cubic for smooth deceleration
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(startValueRef.current + (value - startValueRef.current) * eased);

            setDisplayValue(current);

            if (progress < 1) {
                animationRef.current = requestAnimationFrame(animate);
            }
        };

        animationRef.current = requestAnimationFrame(animate);

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [value, duration]);

    return <span className={className}>{displayValue.toLocaleString()}</span>;
};

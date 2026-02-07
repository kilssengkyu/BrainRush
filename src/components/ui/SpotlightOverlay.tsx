import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

interface SpotlightOverlayProps {
    targetRef: React.RefObject<HTMLElement | null>;
    message: string;
    onNext: () => void;
    onSkip?: () => void;
    isLast?: boolean;
    stepNumber?: number;
    totalSteps?: number;
    onAction?: () => void;
    actionLabel?: string;
}

const SpotlightOverlay: React.FC<SpotlightOverlayProps> = ({
    targetRef,
    message,
    onNext,
    onSkip,
    isLast = false,
    stepNumber,
    totalSteps,
    onAction,
    actionLabel,
}) => {
    const { t } = useTranslation();
    const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
    const overlayRef = useRef<HTMLDivElement>(null);

    // Update target position on mount and resize
    useEffect(() => {
        const updatePosition = () => {
            if (targetRef.current) {
                const rect = targetRef.current.getBoundingClientRect();
                setTargetRect(rect);
            }
        };

        updatePosition();

        // Update on scroll/resize
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);

        // Also observe for layout changes
        const observer = new ResizeObserver(updatePosition);
        if (targetRef.current) {
            observer.observe(targetRef.current);
        }

        return () => {
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
            observer.disconnect();
        };
    }, [targetRef]);

    if (!targetRect) return null;

    // Padding around spotlight
    const padding = 8;
    const spotlightX = targetRect.left - padding;
    const spotlightY = targetRect.top - padding;
    const spotlightWidth = targetRect.width + padding * 2;
    const spotlightHeight = targetRect.height + padding * 2;
    const borderRadius = 16;

    // Tooltip position (below or above the target)
    const spaceBelow = window.innerHeight - targetRect.bottom;
    const tooltipBelow = spaceBelow > 150;
    const tooltipY = tooltipBelow
        ? targetRect.bottom + 16
        : targetRect.top - 16;

    return (
        <AnimatePresence>
            <motion.div
                ref={overlayRef}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="fixed inset-0 z-[9999] pointer-events-auto"
                style={{
                    background: `radial-gradient(ellipse at center, transparent 0%, transparent 0%, rgba(0,0,0,0) 0%)`,
                }}
            >
                {/* Dark overlay with spotlight hole using SVG mask */}
                <svg className="absolute inset-0 w-full h-full">
                    <defs>
                        <mask id="spotlight-mask">
                            <rect x="0" y="0" width="100%" height="100%" fill="white" />
                            <rect
                                x={spotlightX}
                                y={spotlightY}
                                width={spotlightWidth}
                                height={spotlightHeight}
                                rx={borderRadius}
                                ry={borderRadius}
                                fill="black"
                            />
                        </mask>
                    </defs>
                    <rect
                        x="0"
                        y="0"
                        width="100%"
                        height="100%"
                        fill="rgba(0, 0, 0, 0.85)"
                        mask="url(#spotlight-mask)"
                    />
                </svg>

                {/* Spotlight border glow */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1, duration: 0.3 }}
                    className="absolute pointer-events-none"
                    style={{
                        left: spotlightX - 2,
                        top: spotlightY - 2,
                        width: spotlightWidth + 4,
                        height: spotlightHeight + 4,
                        borderRadius: borderRadius + 2,
                        border: '2px solid rgba(59, 130, 246, 0.8)',
                        boxShadow: '0 0 20px rgba(59, 130, 246, 0.5), inset 0 0 20px rgba(59, 130, 246, 0.1)',
                    }}
                />

                {/* Tooltip */}
                <motion.div
                    initial={{ opacity: 0, y: tooltipBelow ? -10 : 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.3 }}
                    className="absolute left-4 right-4 flex justify-center"
                    style={{
                        top: tooltipBelow ? tooltipY : 'auto',
                        bottom: tooltipBelow ? 'auto' : window.innerHeight - tooltipY,
                    }}
                >
                    <div className="bg-gray-900/95 backdrop-blur-md border border-blue-500/30 rounded-2xl p-5 max-w-sm shadow-2xl">
                        {/* Step indicator */}
                        {stepNumber !== undefined && totalSteps !== undefined && (
                            <div className="flex items-center gap-1.5 mb-3">
                                {Array.from({ length: totalSteps }).map((_, i) => (
                                    <div
                                        key={i}
                                        className={`h-1.5 rounded-full transition-all ${i === stepNumber
                                            ? 'w-6 bg-blue-500'
                                            : i < stepNumber
                                                ? 'w-1.5 bg-blue-500/50'
                                                : 'w-1.5 bg-gray-600'
                                            }`}
                                    />
                                ))}
                            </div>
                        )}

                        {/* Message */}
                        <p className="text-white text-base font-medium leading-relaxed mb-4">
                            {message}
                        </p>

                        {/* Buttons */}
                        <div className="flex items-center justify-between gap-3">
                            {onSkip && !isLast && (
                                <button
                                    onClick={onSkip}
                                    className="px-4 py-2 text-gray-400 hover:text-white text-sm font-medium transition-colors"
                                >
                                    {t('tutorial.skip', '건너뛰기')}
                                </button>
                            )}
                            <div className="flex-1" />
                            {onAction && actionLabel && (
                                <button
                                    onClick={onAction}
                                    className="px-5 py-2.5 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl transition-colors active:scale-95"
                                >
                                    {actionLabel}
                                </button>
                            )}
                            <button
                                onClick={onNext}
                                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-colors active:scale-95"
                            >
                                {isLast ? t('tutorial.done', '완료') : t('tutorial.next', '다음')}
                            </button>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default SpotlightOverlay;

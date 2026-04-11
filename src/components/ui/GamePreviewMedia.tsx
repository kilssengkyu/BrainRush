import { useEffect, useMemo, useState } from 'react';

type GamePreviewMediaProps = {
    gameId: string | null | undefined;
    className?: string;
};

const LEGACY_NAME_ALIASES: Record<string, string[]> = {
    ten: ['maketen'],
    memory: ['memorize'],
};

const GamePreviewMedia = ({ gameId, className }: GamePreviewMediaProps) => {
    const normalizedId = (gameId || '').trim().toLowerCase();

    const candidates = useMemo(() => {
        if (!normalizedId) return null;
        const aliases = LEGACY_NAME_ALIASES[normalizedId] ?? [];
        const names = Array.from(new Set([normalizedId, ...aliases]));

        const video = names.flatMap((name) => [
            `/game-previews/videos/${name}.mp4`,
            `/game-previews/videos/${name}.mov`,
        ]);
        const image = names.map((name) => `/game-previews/${name}.webp`);

        return { video, image };
    }, [normalizedId]);

    const [videoIndex, setVideoIndex] = useState(0);
    const [imageIndex, setImageIndex] = useState(0);
    const [phase, setPhase] = useState<'video' | 'image' | 'none'>('video');

    useEffect(() => {
        setVideoIndex(0);
        setImageIndex(0);
        setPhase(candidates && candidates.video.length > 0 ? 'video' : 'image');
    }, [normalizedId]);

    useEffect(() => {
        if (!candidates) return;
        if (phase === 'video' && videoIndex >= candidates.video.length) {
            setPhase('image');
        }
    }, [candidates, phase, videoIndex]);

    useEffect(() => {
        if (!candidates) return;
        if (phase === 'image' && imageIndex >= candidates.image.length) {
            setPhase('none');
        }
    }, [candidates, phase, imageIndex]);

    if (!candidates || phase === 'none') return null;

    if (phase === 'video') {
        const src = candidates.video[videoIndex];
        if (!src) return null;

        return (
            <video
                key={src}
                src={src}
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                className={className}
                onError={() => {
                    setVideoIndex((prev) => prev + 1);
                }}
            />
        );
    }

    const fallbackSrc = candidates.image[imageIndex];
    if (!fallbackSrc) return null;

    return (
        <img
            src={fallbackSrc}
            alt=""
            aria-hidden="true"
            className={className}
            onError={() => {
                if (imageIndex + 1 < candidates.image.length) {
                    setImageIndex((prev) => prev + 1);
                    return;
                }
                setPhase('none');
            }}
        />
    );
};

export default GamePreviewMedia;

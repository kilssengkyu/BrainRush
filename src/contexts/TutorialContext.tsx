import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface TutorialStep {
    id: string;
    messageKey: string;
}

interface TutorialContextType {
    // Home Tutorial
    isHomeTutorialActive: boolean;
    homeTutorialStep: number;
    homeTutorialSteps: TutorialStep[];

    // Profile Tutorial
    isProfileTutorialActive: boolean;

    // Actions
    startHomeTutorial: () => void;
    nextHomeTutorialStep: () => void;
    skipHomeTutorial: () => void;
    completeHomeTutorial: () => void;
    resetHomeTutorial: () => void;

    startProfileTutorial: () => void;
    completeProfileTutorial: () => void;

    // Check functions
    hasSeenHomeTutorial: () => boolean;
    hasSeenProfileTutorial: () => boolean;
}

const HOME_TUTORIAL_STEPS: TutorialStep[] = [
    { id: 'normal', messageKey: 'tutorial.normal' },
    { id: 'rank', messageKey: 'tutorial.rank' },
    { id: 'practice', messageKey: 'tutorial.practice' },
    { id: 'ranking', messageKey: 'tutorial.ranking' },
    { id: 'shop', messageKey: 'tutorial.shop' },
    { id: 'settings', messageKey: 'tutorial.settings' },
    { id: 'login', messageKey: 'tutorial.login' },
];

const STORAGE_KEYS = {
    HOME_TUTORIAL: 'brainrush_home_tutorial_seen',
    PROFILE_TUTORIAL: 'brainrush_profile_tutorial_seen',
};

const TutorialContext = createContext<TutorialContextType | undefined>(undefined);

export const useTutorial = () => {
    const context = useContext(TutorialContext);
    if (!context) {
        throw new Error('useTutorial must be used within a TutorialProvider');
    }
    return context;
};

export const TutorialProvider = ({ children }: { children: React.ReactNode }) => {
    const [isHomeTutorialActive, setIsHomeTutorialActive] = useState(false);
    const [homeTutorialStep, setHomeTutorialStep] = useState(0);
    const [isProfileTutorialActive, setIsProfileTutorialActive] = useState(false);

    // Check localStorage on mount
    useEffect(() => {
        const hasSeenHome = localStorage.getItem(STORAGE_KEYS.HOME_TUTORIAL) === 'true';
        if (!hasSeenHome) {
            // Small delay to let the UI render first
            const timer = setTimeout(() => {
                setIsHomeTutorialActive(true);
                setHomeTutorialStep(0);
            }, 500);
            return () => clearTimeout(timer);
        }
    }, []);

    const hasSeenHomeTutorial = useCallback(() => {
        return localStorage.getItem(STORAGE_KEYS.HOME_TUTORIAL) === 'true';
    }, []);

    const hasSeenProfileTutorial = useCallback(() => {
        return localStorage.getItem(STORAGE_KEYS.PROFILE_TUTORIAL) === 'true';
    }, []);

    const startHomeTutorial = useCallback(() => {
        setIsHomeTutorialActive(true);
        setHomeTutorialStep(0);
    }, []);

    const nextHomeTutorialStep = useCallback(() => {
        if (homeTutorialStep < HOME_TUTORIAL_STEPS.length - 1) {
            setHomeTutorialStep(prev => prev + 1);
        } else {
            // Last step, complete tutorial
            completeHomeTutorial();
        }
    }, [homeTutorialStep]);

    const skipHomeTutorial = useCallback(() => {
        localStorage.setItem(STORAGE_KEYS.HOME_TUTORIAL, 'true');
        setIsHomeTutorialActive(false);
        setHomeTutorialStep(0);
    }, []);

    const completeHomeTutorial = useCallback(() => {
        localStorage.setItem(STORAGE_KEYS.HOME_TUTORIAL, 'true');
        setIsHomeTutorialActive(false);
        setHomeTutorialStep(0);
    }, []);

    const resetHomeTutorial = useCallback(() => {
        localStorage.removeItem(STORAGE_KEYS.HOME_TUTORIAL);
        setHomeTutorialStep(0);
        setIsHomeTutorialActive(true);
    }, []);

    const startProfileTutorial = useCallback(() => {
        const hasSeen = localStorage.getItem(STORAGE_KEYS.PROFILE_TUTORIAL) === 'true';
        if (!hasSeen) {
            setIsProfileTutorialActive(true);
        }
    }, []);

    const completeProfileTutorial = useCallback(() => {
        localStorage.setItem(STORAGE_KEYS.PROFILE_TUTORIAL, 'true');
        setIsProfileTutorialActive(false);
    }, []);

    return (
        <TutorialContext.Provider
            value={{
                isHomeTutorialActive,
                homeTutorialStep,
                homeTutorialSteps: HOME_TUTORIAL_STEPS,
                isProfileTutorialActive,
                startHomeTutorial,
                nextHomeTutorialStep,
                skipHomeTutorial,
                completeHomeTutorial,
                resetHomeTutorial,
                startProfileTutorial,
                completeProfileTutorial,
                hasSeenHomeTutorial,
                hasSeenProfileTutorial,
            }}
        >
            {children}
        </TutorialContext.Provider>
    );
};

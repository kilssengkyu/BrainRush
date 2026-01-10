import React, { createContext, useContext, useState, type ReactNode } from 'react';
import { AnimatePresence } from 'framer-motion';
import Toast from '../components/ui/Toast';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

interface ToastData {
    id: string;
    message: string;
    type: 'success' | 'error' | 'info';
}

interface DialogData {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
}

interface UIContextType {
    showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
    confirm: (title: string, message: string) => Promise<boolean>;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export const useUI = () => {
    const context = useContext(UIContext);
    if (!context) {
        throw new Error('useUI must be used within a UIProvider');
    }
    return context;
};

export const UIProvider = ({ children }: { children: ReactNode }) => {
    const [toasts, setToasts] = useState<ToastData[]>([]);
    const [dialog, setDialog] = useState<DialogData>({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: () => { },
        onCancel: () => { },
    });

    const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
        const id = Math.random().toString(36).substr(2, 9);
        setToasts((prev) => [...prev, { id, message, type }]);
        setTimeout(() => removeToast(id), 3000);
    };

    const removeToast = (id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    };

    const confirm = (title: string, message: string): Promise<boolean> => {
        return new Promise((resolve) => {
            setDialog({
                isOpen: true,
                title,
                message,
                onConfirm: () => {
                    setDialog((prev) => ({ ...prev, isOpen: false }));
                    resolve(true);
                },
                onCancel: () => {
                    setDialog((prev) => ({ ...prev, isOpen: false }));
                    resolve(false);
                },
            });
        });
    };

    return (
        <UIContext.Provider value={{ showToast, confirm }}>
            {children}

            {/* Toast Container */}
            <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
                <AnimatePresence>
                    {toasts.map((toast) => (
                        <Toast key={toast.id} message={toast.message} type={toast.type} onClose={() => removeToast(toast.id)} />
                    ))}
                </AnimatePresence>
            </div>

            {/* Dialog Container */}
            <AnimatePresence>
                {dialog.isOpen && (
                    <ConfirmDialog
                        title={dialog.title}
                        message={dialog.message}
                        onConfirm={dialog.onConfirm}
                        onCancel={dialog.onCancel}
                    />
                )}
            </AnimatePresence>
        </UIContext.Provider>
    );
};

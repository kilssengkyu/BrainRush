import React from 'react';

interface FlagProps {
    code: string | null | undefined;
    className?: string;
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}

const Flag: React.FC<FlagProps> = ({ code, className = '', size = 'md' }) => {
    if (!code) return null;

    const sizeClass = {
        xs: 'text-xs',
        sm: 'text-sm',
        md: 'text-base',
        lg: 'text-xl',
        xl: 'text-3xl'
    }[size];

    return (
        <span
            className={`fi fi-${code.toLowerCase()} ${sizeClass} ${className} rounded-sm shadow-sm`}
            title={code}
        />
    );
};

export default Flag;

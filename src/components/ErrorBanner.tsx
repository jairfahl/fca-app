'use client';

type ErrorBannerProps = {
    message: string;
};

export function ErrorBanner({ message }: ErrorBannerProps) {
    return (
        <div style={{
            background: '#fee',
            border: '1px solid #c00',
            padding: '1rem',
            margin: '1rem 0',
            borderRadius: '4px',
            color: '#c00'
        }}>
            {message}
        </div>
    );
}

import Link from 'next/link';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  href?: string;
};

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: { backgroundColor: '#0070f3', color: '#fff' },
  secondary: { backgroundColor: '#111827', color: '#fff' },
  ghost: { backgroundColor: 'transparent', color: '#0070f3', border: '1px solid #d1d5db' }
};

export default function Button({ variant = 'primary', href, style, children, ...rest }: ButtonProps) {
  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.65rem 1rem',
    borderRadius: '8px',
    fontWeight: 600,
    fontSize: '0.95rem',
    textDecoration: 'none',
    border: '1px solid transparent',
    cursor: 'pointer',
    ...variantStyles[variant],
    ...style
  };

  if (href) {
    return (
      <Link href={href} style={baseStyle}>
        {children}
      </Link>
    );
  }

  return (
    <button {...rest} style={baseStyle}>
      {children}
    </button>
  );
}

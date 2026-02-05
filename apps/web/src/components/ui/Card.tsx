type CardProps = {
  children: React.ReactNode;
  style?: React.CSSProperties;
};

export default function Card({ children, style }: CardProps) {
  return (
    <div style={{
      border: '1px solid #e5e7eb',
      borderRadius: '12px',
      padding: '1.5rem',
      backgroundColor: '#fff',
      ...style
    }}>
      {children}
    </div>
  );
}

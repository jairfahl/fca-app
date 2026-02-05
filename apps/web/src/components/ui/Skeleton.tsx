type SkeletonProps = {
  height?: string;
  width?: string;
};

export default function Skeleton({ height = '1rem', width = '100%' }: SkeletonProps) {
  return (
    <div style={{
      height,
      width,
      borderRadius: '6px',
      background: 'linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 37%, #f3f4f6 63%)',
      backgroundSize: '400% 100%',
      animation: 'skeleton 1.4s ease infinite'
    }} />
  );
}

interface BrandMarkProps {
  className?: string;
  decorative?: boolean;
}

export default function BrandMark({ className = '', decorative = false }: BrandMarkProps) {
  return (
    <img
      className={['lexora-logo', className].filter(Boolean).join(' ')}
      src="/lexora-mark.svg"
      alt={decorative ? '' : 'Lexora'}
    />
  );
}

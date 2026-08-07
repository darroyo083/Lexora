import type { ReactNode } from 'react';

interface Props {
  active: boolean;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export default function LiquidGlassContainer({ children, className = '', style }: Props) {
  return (
    <div className={`premium-toolbar-container ${className}`} style={style}>
      {children}
    </div>
  );
}

import React from 'react';

interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  glow?: boolean;
}

export const GlassPanel: React.FC<GlassPanelProps> = ({ 
  children, 
  glow = false, 
  className = '', 
  style, 
  ...props 
}) => {
  return (
    <div 
      className={`glass-panel ${className}`} 
      style={{
        borderRadius: '12px',
        padding: '24px',
        boxShadow: glow ? 'var(--glass-glow), var(--glass-glow-cyan)' : 'var(--glass-glow)',
        ...style
      }}
      {...props}
    >
      {children}
    </div>
  );
};

export default GlassPanel;

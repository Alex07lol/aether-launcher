import React from 'react';
import { MicrosoftIcon } from './Icons';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'microsoft' | 'danger';
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ 
  variant = 'primary', 
  children, 
  className = '', 
  ...props 
}) => {
  const isMicrosoft = variant === 'microsoft';
  
  return (
    <button 
      className={`aether-btn btn-${variant} ${className}`} 
      {...props}
    >
      {isMicrosoft && <MicrosoftIcon className="btn-microsoft-icon" />}
      <span className="btn-text">{children}</span>
    </button>
  );
};

export default Button;

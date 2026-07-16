import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({ icon, className = '', ...props }) => {
  return (
    <div className="aether-input-wrapper">
      {icon && <div className="aether-input-icon-container">{icon}</div>}
      <input 
        className={`aether-input-field ${icon ? 'has-icon' : ''} ${className}`}
        {...props}
      />
    </div>
  );
};

export default Input;

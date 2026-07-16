import React from 'react';

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export const Checkbox: React.FC<CheckboxProps> = ({ label, id, className = '', ...props }) => {
  const checkboxId = id || `checkbox-${Math.random().toString(36).substr(2, 9)}`;
  
  return (
    <div className={`aether-checkbox-container ${className}`}>
      <input 
        type="checkbox" 
        id={checkboxId}
        className="aether-checkbox-input"
        {...props}
      />
      <label htmlFor={checkboxId} className="aether-checkbox-label">
        <span className="checkbox-custom-box"></span>
        <span className="checkbox-text-content">{label}</span>
      </label>
    </div>
  );
};

export default Checkbox;

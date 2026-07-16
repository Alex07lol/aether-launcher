import React from 'react';

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
}

// Official Microsoft Logo SVG Component
export const MicrosoftIcon: React.FC<IconProps> = ({ size, ...props }) => (
  <svg viewBox="0 0 23 23" width={size || 20} height={size || 20} {...props}>
    <rect x="0" y="0" width="10.5" height="10.5" fill="#f25022" />
    <rect x="11.5" y="0" width="10.5" height="10.5" fill="#7fba00" />
    <rect x="0" y="11.5" width="10.5" height="10.5" fill="#00a4ef" />
    <rect x="11.5" y="11.5" width="10.5" height="10.5" fill="#ffb900" />
  </svg>
);

// High-quality modern SVG Grass Block Icon (representing Minecraft)
export const GrassBlockIcon: React.FC<IconProps> = ({ size, ...props }) => (
  <svg viewBox="0 0 24 24" width={size || 20} height={size || 20} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    {/* Outline of isometric cube */}
    <path d="M12 2L2 7l10 5 10-5-10-5z" fill="rgba(74, 187, 81, 0.2)" stroke="currentColor" />
    <path d="M2 17l10 5 10-5M2 7v10M22 7v10M12 12v10" stroke="currentColor" />
    
    {/* Grass Top texture lines */}
    <path d="M12 12l-4-2M12 12l4-2M12 2l-4 2M12 2l4 2" stroke="currentColor" opacity="0.6" />
    
    {/* Dirt border jagged line for isometric side representation */}
    <path d="M2 7.2v3l2.5 1.5 2-1 2 1.5 2-1 3.5 1.8 3-1.5 3 1.5 2-1.2v-3.1" stroke="currentColor" fill="rgba(74, 187, 81, 0.4)" />
  </svg>
);

// Rocket Icon (Lucide-like style to match other icons)
export const RocketIcon: React.FC<IconProps> = ({ size, ...props }) => (
  <svg viewBox="0 0 24 24" width={size || 18} height={size || 18} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
    <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
    <path d="M9 15l-5.5 5.5" />
    <path d="M15 9l5.5-5.5" />
    <path d="M9 9a3 3 0 1 1 0-6M15 15a3 3 0 1 1-6 0" />
  </svg>
);

// User Icon
export const UserIcon: React.FC<IconProps> = ({ size, ...props }) => (
  <svg viewBox="0 0 24 24" width={size || 18} height={size || 18} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

// Version Switch Icon (⇅)
export const VersionSwitchIcon: React.FC<IconProps> = ({ size, ...props }) => (
  <svg viewBox="0 0 24 24" width={size || 18} height={size || 18} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M17 4v16M17 4l-4 4M17 4l4 4M7 20V4M7 20l-4-4M7 20l4-4" />
  </svg>
);

// Settings Gear Icon
export const SettingsIcon: React.FC<IconProps> = ({ size, ...props }) => (
  <svg viewBox="0 0 24 24" width={size || 18} height={size || 18} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

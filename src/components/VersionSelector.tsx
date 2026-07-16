import React from 'react';
import { GrassBlockIcon, VersionSwitchIcon } from './Icons';
import { ChevronDown } from 'lucide-react';

interface VersionSelectorProps {
  selectedVersion: string;
  isSelectorOpen: boolean;
  onTriggerClick: () => void;
  onVersionSelect: (version: string) => void;
  versions?: string[];
  disabled?: boolean;
}

export const VersionSelector: React.FC<VersionSelectorProps> = ({
  selectedVersion,
  isSelectorOpen,
  onTriggerClick,
  onVersionSelect,
  versions = ['1.8.9', '1.7.10'],
  disabled = false,
}) => {
  return (
    <div className="aether-version-selector-container">
      <div className="version-selector-main-trigger-wrapper">
        <button
          onClick={onTriggerClick}
          className="version-selector-trigger-btn"
          disabled={disabled}
          type="button"
        >
          <div className="trigger-left-content">
            <GrassBlockIcon className="grass-block-icon" />
            <span className="version-text-label">Minecraft {selectedVersion}</span>
          </div>
          <ChevronDown className={`dropdown-chevron ${isSelectorOpen ? 'open' : ''}`} size={16} />
        </button>

        {isSelectorOpen && (
          <div className="version-dropdown-menu">
            {versions.map((ver) => (
              <button
                key={ver}
                onClick={() => onVersionSelect(ver)}
                className={`version-dropdown-option ${selectedVersion === ver ? 'selected' : ''}`}
                type="button"
              >
                <span>Minecraft {ver}</span>
                {selectedVersion === ver && <span className="active-dot" />}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={onTriggerClick}
        className="version-swap-action-btn"
        disabled={disabled}
        title="Switch Versions"
        type="button"
      >
        <VersionSwitchIcon />
      </button>
    </div>
  );
};

export default VersionSelector;

import React, { ReactElement, ReactNode } from 'react';
import useMediaQuery from './MediaQuery'
import styles from './Toolbar.module.css';

type PropsType = {
  children?: ReactNode,
  onToggleClick?: () => void,
}

const Toolbar = ({
  children,
  onToggleClick,
}: PropsType): ReactElement | null => {
  const { isMobile } = useMediaQuery();

  return (
    <div className={styles.toolbar}>
      {
        isMobile
          ? (
            <div className="navbar-light">
              <button type="button" className="navbar-toggler" onClick={onToggleClick}>
                <span className="navbar-toggler-icon" />
              </button>
            </div>
          )
          : null
      }
      {children}
    </div>
  );
};

export default Toolbar;

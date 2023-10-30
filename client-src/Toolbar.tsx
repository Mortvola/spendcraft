import React, { ReactNode } from 'react';
import useMediaQuery from './MediaQuery'
import styles from './Toolbar.module.scss';

type PropsType = {
  children?: ReactNode,
  onToggleClick?: () => void,
}

const Toolbar: React.FC<PropsType> = ({
  children,
  onToggleClick,
}) => {
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

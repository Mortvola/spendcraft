import React, { ReactElement, ReactNode } from 'react';
import styles from './Toolbar.module.css';

type PropsType = {
  children?: ReactNode,
}

const Toolbar = ({
  children,
}: PropsType): ReactElement | null => {
  if (children) {
    return (
      <div className={styles.toolbar}>
        {children}
      </div>
    );
  }

  return null;
};

export default Toolbar;

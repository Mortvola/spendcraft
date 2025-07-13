import React from 'react';
import useMediaQuery from './MediaQuery';

interface PropsType {
  children?: React.ReactNode,
}

const DesktopView: React.FC<PropsType> = ({
  children,
}) => {
  const { isMobile } = useMediaQuery();

  return isMobile
    ? null
    : (
      <>
        {children}
      </>
    )
}

export default DesktopView;

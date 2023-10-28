import React from 'react';
import useMediaQuery from './MediaQuery';

type PropsType = {
  children?: React.ReactNode,
}

const DesktopView: React.FC<PropsType> = ({
  children,
}) => {
  const { isMobile } = useMediaQuery();

  return isMobile
    ? null
    : (
      // eslint-disable-next-line react/jsx-no-useless-fragment
      <>
        {children}
      </>
    )
}

export default DesktopView;

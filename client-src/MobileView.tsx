import React from 'react';
import useMediaQuery from './MediaQuery';

interface PropsType {
  children?: React.ReactNode,
}

const MobileView: React.FC<PropsType> = ({
  children,
}) => {
  const { isMobile } = useMediaQuery();

  return isMobile
    ? (
      // eslint-disable-next-line react/jsx-no-useless-fragment
      <>
        {children}
      </>
    )
    : null
}

export default MobileView;

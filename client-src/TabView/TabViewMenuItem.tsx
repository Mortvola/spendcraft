import React from 'react';

type PropsType = {
  onClick?: () => void,
  children: React.ReactNode
}

const TabViewMenuItem: React.FC<PropsType> = ({
  onClick,
  children,
}) => {
  const handleClick: React.MouseEventHandler<HTMLDivElement> = (event) => {
    // event.stopPropagation();

    if (onClick) {
      onClick();
    }
  }

  return (
    <div onClick={handleClick}>{children}</div>
  )
}

export default TabViewMenuItem;

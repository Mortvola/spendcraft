import React from 'react';

interface PropsType {
  onClick?: () => void,
  children: React.ReactNode
}

const TabViewMenuItem: React.FC<PropsType> = ({
  onClick,
  children,
}) => {
  const handleClick: React.MouseEventHandler<HTMLDivElement> = (_event) => {
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

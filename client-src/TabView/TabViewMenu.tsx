import React from 'react';
import { createPortal } from 'react-dom';
import styles from './TabViewButton.module.scss';
import menuStyles from './TabViewMenu.module.scss';
import LucideButton from '../LucideButton';

interface PropsType {
  icon: React.ReactNode,
  caption: string,
  // url: string,
  // onClick: () => void,
  children?: React.ReactNode,
}

const TabViewMenu: React.FC<PropsType> = ({
  icon,
  caption,
  children,
}) => {
  const [open, setOpen] = React.useState<boolean>(false);

  const handleClick = () => {
    setOpen((prev) => !open)
  }

  const handleWrapperClick = () => {
    setOpen(false);
  }

  return (
    <>
      <LucideButton
        caption={caption}
        className={`${styles.icon}`}
        onClick={handleClick}
      >
        {icon}
      </LucideButton>
      {
        open
          ? (
            createPortal(
              <div className={menuStyles.wrapper} onClick={handleWrapperClick}>
                <div className={menuStyles.items}>
                  { children }
                </div>
              </div>,
              document.body,
            )
          )
          : null
      }
    </>
  )
}

export default TabViewMenu;

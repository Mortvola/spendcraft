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
  const ref = React.useRef<HTMLButtonElement>(null);
  const [position, setPosition] = React.useState<React.CSSProperties>()
  const wrapperRef = React.useRef<HTMLDivElement>(null)
  const itemsRef = React.useRef<HTMLDivElement>(null)

  React.useLayoutEffect(() => {
    if (!position) {
      const element = ref.current
      const wrapperElement = wrapperRef.current
      const itemsElement = itemsRef.current

      if (element && wrapperElement && itemsElement) {
        const buttonsRect = element.getBoundingClientRect()
        const wrapperRect = wrapperElement.getBoundingClientRect()
        const itemsRect = itemsElement.getBoundingClientRect()

        const positionProps: React.CSSProperties = { visibility: 'visible' }
        if (buttonsRect.bottom + itemsRect.height <= wrapperRect.bottom) {
          positionProps.top = buttonsRect.bottom;
        } else {
          positionProps.top = 'unset';
          positionProps.bottom = wrapperRect.bottom - buttonsRect.top;
        }

        if (buttonsRect.left + itemsRect.width <= wrapperRect.right) {
          positionProps.left = buttonsRect.left
        } else {
          positionProps.left = 'unset';
          positionProps.right = wrapperRect.right - buttonsRect.right;
        }

        setPosition(positionProps)
      }
    }
  })

  const handleClick = () => {
    setOpen((_prev) => !open)
    setPosition(undefined)
  }

  const handleWrapperClick = () => {
    setOpen(false);
  }

  return (
    <>
      <LucideButton
        ref={ref}
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
              <div ref={wrapperRef} className={menuStyles.wrapper} onClick={handleWrapperClick}>
                <div ref={itemsRef} className={menuStyles.items} style={position}>
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

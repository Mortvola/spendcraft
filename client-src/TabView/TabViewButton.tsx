import React from 'react';
import {
  matchPath, useLocation,
} from 'react-router';
import styles from './TabViewButton.module.scss';
import LucideButton from '../LucideButton';

interface PropsType {
  icon: React.ReactNode,
  caption: string,
  url: string,
  onClick: () => void,
}

const TabViewButton: React.FC<PropsType> = ({
  icon,
  caption,
  url,
  onClick,
}) => {
  const location = useLocation();
  const [match, setMatch] = React.useState<boolean>(false);

  React.useEffect(() => {
    const matched = matchPath({ path: url, caseSensitive: false, end: false }, location.pathname);
    setMatch(matched !== null);
  }, [location.pathname, url]);

  return (
    <LucideButton
      caption={caption}
      className={`${styles.icon} ${match ? 'active' : ''}`}
      onClick={onClick}
    >
      {icon}
    </LucideButton>
  )
}

export default TabViewButton;

import React from 'react';
import {
  matchPath, useLocation,
} from 'react-router-dom';
import IconButton from './IconButton';
import styles from './TabViewButton.module.scss';

type PropsType = {
  icon: string,
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
    <IconButton
      icon={icon}
      caption={caption}
      className={`${styles.icon} ${match ? 'active' : ''}`}
      iconClass="fa-solid"
      onClick={onClick}
    />
  )
}

export default TabViewButton;

import React from 'react';
import { useNavigate, matchPath, useLocation } from 'react-router-dom';
import IconButton from './IconButton';
import styles from './TabViewButton.module.scss';

type PropsType = {
  icon: string,
  caption: string,
  url: string,
}

const TabViewButton: React.FC<PropsType> = ({
  icon,
  caption,
  url,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [match, setMatch] = React.useState<boolean>(false);

  React.useEffect(() => {
    const matched = matchPath({ path: url, caseSensitive: false, end: false }, location.pathname);
    setMatch(matched !== null);
  }, [location.pathname, url]);

  const handleClick = () => {
    navigate(url);
  }

  return (
    <IconButton
      icon={icon}
      caption={caption}
      className={`${styles.icon} ${match ? 'active' : ''}`}
      iconClass="fa-solid"
      onClick={handleClick}
    />
  )
}

export default TabViewButton;

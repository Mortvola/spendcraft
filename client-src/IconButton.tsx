import React, { ReactElement } from 'react';
import Icon from './Icon';
import styles from './IconButton.module.css';

interface Props {
  icon: string;
  rotate?: boolean;
  iconColor?: string,
  onClick?: () => void;
}

const IconButton = ({
  icon,
  rotate = false,
  iconColor,
  onClick,
}: Props): ReactElement => (
  <button type="button" className={`btn btn-sm ${styles.groupButton}`} onClick={onClick}>
    <Icon icon={icon} rotate={rotate} style={{ color: iconColor }} />
  </button>
);

export default IconButton;

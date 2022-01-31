import React, { ReactElement } from 'react';
import Icon from './Icon';
import styles from './IconButton.module.css';

interface Props {
  icon: string;
  rotate?: boolean;
  iconColor?: string,
  solid?: boolean,
  onClick?: () => void;
}

const IconButton = ({
  icon,
  rotate = false,
  iconColor,
  solid = true,
  onClick,
}: Props): ReactElement => (
  <button type="button" className={`btn btn-sm ${styles.groupButton}`} onClick={onClick}>
    <Icon icon={icon} rotate={rotate} style={{ color: iconColor }} solid={solid} />
  </button>
);

export default IconButton;

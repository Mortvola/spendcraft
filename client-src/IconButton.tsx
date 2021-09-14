import React, { ReactElement } from 'react';
import Icon from './Icon';
import styles from './IconButton.module.css';

interface Props {
  icon: string;
  rotate?: boolean;
  onClick?: () => void;
}

const IconButton = ({
  icon,
  rotate = false,
  onClick,
}: Props): ReactElement => (
  <button type="button" className={`btn btn-sm ${styles.groupButton}`} onClick={onClick}>
    <Icon icon={icon} rotate={rotate} />
  </button>
);

export default IconButton;

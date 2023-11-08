import React, { ReactNode } from 'react';
import styles from './ReportListItem.module.scss';

type PropsType = {
  value: string,
  onSelect: (value: string) => void,
  selected?: boolean,
  children: ReactNode,
}

const ReportListItem: React.FC<PropsType> = ({
  value,
  onSelect,
  selected = false,
  children,
}) => {
  const handleClick = () => {
    onSelect(value);
  }

  let className = styles.reportListItem;
  if (selected) {
    className += ' selected';
  }

  return (
    <div className={className} onClick={handleClick}>{children}</div>
  )
}

export default ReportListItem;

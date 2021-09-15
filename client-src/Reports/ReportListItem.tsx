import React, { ReactElement, ReactNode } from 'react';
import styles from './ReportListItem.module.css';

type PropsType = {
  value: string,
  onSelect: (value: string) => void,
  selected?: boolean,
  children: ReactNode,
}

const ReportListItem = ({
  value,
  onSelect,
  selected = false,
  children,
}: PropsType): ReactElement => {
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

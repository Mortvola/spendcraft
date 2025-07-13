import React from 'react';
import { observer } from 'mobx-react-lite';
import { AutoAssignmentInterface } from '../State/Types';
import styles from './AutoAssignment.module.scss';

interface PropsType {
  autoAssignment: AutoAssignmentInterface,
  onClick: (autoAssignment: AutoAssignmentInterface) => void,
}

const AutoAssignment: React.FC<PropsType> = observer(({
  autoAssignment,
  onClick,
}) => {
  const handleClick = () => {
    onClick(autoAssignment)
  }

  return (
    <div className={styles.layout} onClick={handleClick}>{autoAssignment.name}</div>
  )
})

export default AutoAssignment;

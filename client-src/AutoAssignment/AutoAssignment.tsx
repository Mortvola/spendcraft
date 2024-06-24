import React from 'react';
import { observer } from 'mobx-react-lite';
import { AutoAssignmentInterface } from '../State/State';

type PropsType = {
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
    <div onClick={handleClick}>{autoAssignment.name}</div>
  )
})

export default AutoAssignment;

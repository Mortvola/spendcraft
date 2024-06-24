import React from 'react';
import { useAutoAssignmentDialog } from './AutoAssignmentDialog';

const AutoAssigmentsToolbar: React.FC = () => {
  const [AutoAssignmentDialog, showDialog] = useAutoAssignmentDialog();

  const addAutoAssignment = () => {
    showDialog()
  }

  return (
    <>
      <button type="button" onClick={addAutoAssignment}>Add...</button>
      <AutoAssignmentDialog />
    </>
  )
}

export default AutoAssigmentsToolbar;

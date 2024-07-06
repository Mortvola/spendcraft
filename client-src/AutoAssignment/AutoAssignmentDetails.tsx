import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStores } from '../State/Store';
import { useAutoAssignmentDialog } from './AutoAssignmentDialog';
import AutoAssignment from './AutoAssignment';
import { AutoAssignmentInterface } from '../State/Types';

const AutoAssignmentDetails = observer(() => {
  const { autoAssignments } = useStores();
  const [AutoAssignmentDialog, showDialog] = useAutoAssignmentDialog();
  const [editAutoAssignment, setEditedAutoAssignment] = React.useState<AutoAssignmentInterface | undefined>();

  const handleClick = (autoAssginment: AutoAssignmentInterface) => {
    setEditedAutoAssignment(autoAssginment)
    showDialog()
  }

  return (
    <>
      <div>
        {
          autoAssignments.autoAssignemnts.map((a) => (
            <AutoAssignment key={a.id} autoAssignment={a} onClick={handleClick} />
          ))
        }
      </div>
      <AutoAssignmentDialog autoAssignment={editAutoAssignment} />
    </>
  )
})

export default AutoAssignmentDetails;

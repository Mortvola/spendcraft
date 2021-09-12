import React, { ReactElement } from 'react';
import IconButton from '../IconButton';
import { useGroupDialog } from './GroupDialog';
import { isGroup } from '../State/Group';
import { GroupInterface } from '../State/State';

type Props = {
  group: GroupInterface,
}

function GroupButtons({ group }: Props): ReactElement | null {
  const [GroupDialog, showGroupDialog] = useGroupDialog();

  const renderEditButton = () => {
    if (group.type === 'REGULAR' && isGroup(group)) {
      return (
        <>
          <IconButton icon="edit" onClick={showGroupDialog} />
          <GroupDialog group={group} />
        </>
      );
    }

    return null;
  };

  return (
    <>
      {renderEditButton()}
    </>
  );
}

export default GroupButtons;

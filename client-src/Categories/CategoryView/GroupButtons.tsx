import React from 'react';
import IconButton from '../../IconButton';
import { useGroupDialog } from './GroupDialog';
import { isGroup } from '../../State/Group';
import { GroupInterface } from '../../State/State';
import styles from './GroupButton.module.scss';

type PropsType = {
  group: GroupInterface,
}

const GroupButtons: React.FC<PropsType> = ({ group }) => {
  const [GroupDialog, showGroupDialog] = useGroupDialog();

  const renderEditButton = () => {
    if (group.type === 'REGULAR' && isGroup(group)) {
      return (
        <>
          <IconButton icon="edit" onClick={showGroupDialog} className={styles.groupButton} />
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

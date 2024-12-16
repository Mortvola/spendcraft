import React from 'react';
import IconButton from '../../IconButton';
import { useGroupDialog } from './GroupDialog';
import { isGroup } from '../../State/Group';
import { GroupInterface } from '../../State/Types';
import styles from './GroupButton.module.scss';
import { GroupType } from '../../../common/ResponseTypes';

type PropsType = {
  group: GroupInterface,
}

const GroupButtons: React.FC<PropsType> = ({ group }) => {
  const [GroupDialog, showGroupDialog] = useGroupDialog();

  const renderEditButton = () => {
    if (group.type === GroupType.Regular && isGroup(group)) {
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

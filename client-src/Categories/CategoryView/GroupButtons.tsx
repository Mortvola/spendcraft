import React from 'react';
import { SquarePen } from 'lucide-react';
import { useGroupDialog } from './GroupDialog';
import { isGroup } from '../../State/Group';
import { GroupInterface } from '../../State/Types';
import styles from './GroupButton.module.scss';
import { GroupType } from '../../../common/ResponseTypes';
import LucideButton from '../../LucideButton';

type PropsType = {
  group: GroupInterface,
}

const GroupButtons: React.FC<PropsType> = ({ group }) => {
  const [GroupDialog, showGroupDialog] = useGroupDialog();

  const renderEditButton = () => {
    if (group.type === GroupType.Regular && isGroup(group)) {
      return (
        <>
          <LucideButton onClick={showGroupDialog} className={styles.groupButton}>
            <SquarePen size={16} strokeWidth={2.5} />
          </LucideButton>
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

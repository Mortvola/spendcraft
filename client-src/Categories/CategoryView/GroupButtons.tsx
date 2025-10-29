import React from 'react';
import { ChevronDown, ChevronRight, SquarePen } from 'lucide-react';
import { useGroupDialog } from './GroupDialog';
import { isGroup } from '../../State/Group';
import { GroupInterface } from '../../State/Types';
import styles from './CategoryView.module.scss';
import { GroupType } from '../../../common/ResponseTypes';
import LucideButton from '../../LucideButton';
import { observer } from 'mobx-react-lite';

interface PropsType {
  group: GroupInterface,
}

const GroupButtons: React.FC<PropsType> = observer(({ group }) => {
  const [GroupDialog, showGroupDialog] = useGroupDialog();

  const toggleClose = () => {
    group.toggleExpanded()
  }

  if (group.type === GroupType.Regular && isGroup(group)) {
    return (
      <>
          {
            group.expanded
              ? <ChevronDown size={16} strokeWidth={2.5} onClick={toggleClose} />
              : <ChevronRight size={16} strokeWidth={2.5} onClick={toggleClose} />
          }
        <LucideButton onClick={showGroupDialog} className={styles.catButton}>
          <SquarePen size={16} strokeWidth={2.5} />
        </LucideButton>
        <GroupDialog group={group} />
      </>
    );
  }

  return null;
})

export default GroupButtons;

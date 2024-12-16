import React from 'react';
import IconButton from '../../IconButton';
import { useCategoryDialog } from './CategoryDialog';
import { useGroupDialog } from './GroupDialog';
import { isGroup } from '../../State/Group';
import { GroupInterface } from '../../State/Types';
import { GroupType } from '../../../common/ResponseTypes';

type PropsType = {
  group: GroupInterface,
}

const Buttons: React.FC<PropsType> = ({ group }) => {
  const [GroupDialog, showGroupDialog] = useGroupDialog();
  const [CategoryDialog, showCategoryDialog] = useCategoryDialog();

  const renderEditButton = () => {
    if (group.type === GroupType.Regular && isGroup(group)) {
      return (
        <>
          <IconButton icon="edit" onClick={showGroupDialog} />
          <GroupDialog group={group} />
        </>
      );
    }

    return null;
  };

  const renderAddCategoryButton = () => {
    if (group.type === GroupType.Regular && isGroup(group)) {
      return (
        <>
          <IconButton icon="plus" onClick={showCategoryDialog} />
          <CategoryDialog />
        </>
      );
    }

    return null;
  };

  return (
    <>
      {renderAddCategoryButton()}
      {renderEditButton()}
    </>
  );
}

export default Buttons;

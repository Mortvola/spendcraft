import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { isGroup } from '../../State/Group';
import { GroupInterface } from '../../State/Types';
import { GroupType } from '../../../common/ResponseTypes';
import { observer } from 'mobx-react-lite';
import { useStores } from '../../State/Store';

interface PropsType {
  group: GroupInterface,
}

const GroupButtons: React.FC<PropsType> = observer(({ group }) => {
  const { uiState } = useStores()

  const toggleClose: React.MouseEventHandler<SVGSVGElement> = (event) => {
    uiState.toggleGroupExpanded(group.id)
    event.stopPropagation()
  }

  if ([GroupType.Regular, GroupType.NoGroup].includes(group.type) && isGroup(group)) {
    return (
      <div style={{width: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        {
          uiState.groupState.get(group.id) ?? true
            ? <ChevronDown size={16} strokeWidth={2.5} onClick={toggleClose} />
            : <ChevronRight size={16} strokeWidth={2.5} onClick={toggleClose} />
        }
      </div>
    );
  }

  return null;
})

export default GroupButtons;

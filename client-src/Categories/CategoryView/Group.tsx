import React from 'react';
import { observer } from 'mobx-react-lite';
import GroupButtons from './GroupButtons';
import Category from './Category';
import { CategoryInterface, GroupInterface } from '../../State/Types';
import { isCategory } from '../../State/Category';
import Amount from '../../Amount';
import { useStores } from '../../State/Store';
import { GroupType } from '../../../common/ResponseTypes';
import { Settings } from 'lucide-react';
import LucideButton from '../../LucideButton';
import styles from './Group.module.scss';
import { useRootDialog } from './RootDialog';

interface PropsType {
  group: GroupInterface,
  onCategorySelected: ((category: CategoryInterface) => void),
  onGroupSelected: ((group: GroupInterface) => void),
  selectedCategory?: CategoryInterface | null,
  selectedGroup?: GroupInterface | null,
  level?: number,
}

const Group: React.FC<PropsType> = observer(({
  group,
  onCategorySelected,
  onGroupSelected,
  selectedCategory = null,
  selectedGroup = null,
  level = 0,
}) => {
  const { uiState } = useStores()
  const [RootDialog, showRootDialog] = useRootDialog();

  const handleClick = () => {
    onGroupSelected(group);
  };

  let className = 'cat-list-group';
  if (group.id === selectedGroup?.id) {
    className += ' selected';
  }

  const indent = 15;

  return (
    <>
      <div className={className} style={{ marginLeft: indent * level }} onClick={handleClick}>
        <div className="group-element-bar">
          <GroupButtons group={group} />
          {
            group.type === GroupType.NoGroup
              ? (
                <div className={styles.root}>
                  Categories
                  <LucideButton onClick={showRootDialog}>
                    <Settings size={16} strokeWidth={2.5}  />
                  </LucideButton>
                </div>
              )
              : <div>{group.name}</div>
          }
        </div>
        {
          !(uiState.groupState.get(group.id) ?? true)
            ? <Amount amount={group.childrenBalance()} />
            : null
        }
      </div>
      {
        uiState.groupState.get(group.id) ?? true
          ? group.children.map((category) => (
            isCategory(category)
              ? (
                !category.hidden || uiState.showHidden
                  ? (
                    <Category
                      key={category.name}
                      category={category}
                      onCategorySelected={onCategorySelected}
                      selectedCategory={selectedCategory}
                      level={level + 1}
                    />
                  )
                  : null
              )
              : (
                <Group
                  key={category.name}
                  group={category as GroupInterface}
                  onCategorySelected={onCategorySelected}
                  onGroupSelected={onGroupSelected}
                  selectedCategory={selectedCategory}
                  selectedGroup={selectedGroup}
                  level={level + 1}
                />
              )
            ))
          : null
      }
      <RootDialog />
    </>
  )
});

export default Group;

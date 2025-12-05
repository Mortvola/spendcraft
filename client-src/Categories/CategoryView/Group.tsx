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
  selectedCategory?: CategoryInterface | null,
  level?: number,
}

const Group: React.FC<PropsType> = observer(({
  group,
  onCategorySelected,
  selectedCategory = null,
  level = 0,
}) => {
  const { uiState } = useStores()
  const [RootDialog, showRootDialog] = useRootDialog();

  return (
    <>
      <div className="cat-list-group" style={{ marginLeft: 25 * level }}>
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
                  selectedCategory={selectedCategory}
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

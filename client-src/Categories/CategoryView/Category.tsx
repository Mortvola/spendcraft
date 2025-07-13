import React from 'react';
import { observer } from 'mobx-react-lite';
import Amount from '../../Amount';
import EditButton from './EditButton';
import { CategoryInterface } from '../../State/Types';
import { CategoryType } from '../../../common/ResponseTypes';

interface PropsType {
  category: CategoryInterface,
  selectedCategory: CategoryInterface | null,
  onCategorySelected: ((category: CategoryInterface) => void),
  level?: number,
}

const Category: React.FC<PropsType> = observer(({
  category,
  selectedCategory,
  onCategorySelected,
  level = 0,
}) => {
  const handleClick = () => {
    onCategorySelected(category);
  };

  const handleSubcategoryClick = (subcategory: CategoryInterface) => {
    onCategorySelected(subcategory)
  }

  let className = 'cat-list-cat';
  if (category.id === selectedCategory?.id) {
    className += ' selected';
  }

  let barClassName = 'cat-element-bar';
  if (
    category.type !== CategoryType.Loan
    && category.type !== CategoryType.Regular
    && category.type !== CategoryType.Bill
  ) {
    barClassName += ' system';
  }

  return (
    <>
      <div className={className} style={{ marginLeft: 25 * level }} onClick={handleClick}>
        <div className={barClassName}>
          {
            [CategoryType.Regular, CategoryType.Loan, CategoryType.Bill, CategoryType.Goal].includes(category.type)
              ? <EditButton category={category} />
              : null
          }
          <div className="cat-list-name">{category.name}</div>
        </div>
        <Amount className="cat-list-amt" amount={category.balance} />
      </div>
      {
        category.subcategories.length > 0
          ? (
            <>
              {
                category.subcategories.map((sub) => (
                  <Category
                    key={`${sub.id}`}
                    category={sub}
                    onCategorySelected={() => handleSubcategoryClick(sub)}
                    selectedCategory={selectedCategory}
                    level={level + 1}
                  />
                ))
              }
              <div className="cat-list-cat" style={{ marginLeft: 25 * (level + 1) }}>
                <div style={{ justifySelf: 'end', paddingRight: '6px' }}>Total</div>
                <Amount
                  className="cat-list-amt"
                  amount={category.getTotalBalance()}
                  style={{ borderTop: 'thin solid white ' }}
                />
              </div>
            </>
          )
          : null
      }
    </>
  );
});

export default Category;

import React from 'react';
import PropTypes from 'prop-types';
import { observer } from 'mobx-react-lite';
import { useCategoryTransferDialog } from '../CategoryTransferDialog';
import Amount from '../Amount';
import IconButton from '../IconButton';
import EditButton from './EditButton';

const Category = ({
  category,
  group,
  selected,
  onCategorySelected,
}) => {
  const [CategoryTransferDialog, showCategoryTransferDialog] = useCategoryTransferDialog();
  const handleClick = () => {
    onCategorySelected(category.id);
  };

  let className = 'cat-list-cat';
  if (selected) {
    className += ' selected';
  }

  return (
    <div className={className} onClick={handleClick}>
      <div className="cat-element-bar">
        <EditButton category={category} group={group} />
        <IconButton icon="random" onClick={showCategoryTransferDialog} />
        <CategoryTransferDialog />
        <div className="cat-list-name">{category.name}</div>
      </div>
      <Amount className="cat-list-amt" dataCat={category.id} amount={category.balance} />
    </div>
  );
};

Category.propTypes = {
  category: PropTypes.shape({
    id: PropTypes.number.isRequired,
    balance: PropTypes.number,
    name: PropTypes.string.isRequired,
  }),
  group: PropTypes.shape().isRequired,
  onCategorySelected: PropTypes.func.isRequired,
  selected: PropTypes.bool.isRequired,
};

Category.defaultProps = {
  category: {
    amount: 0,
  },
};

export default observer(Category);

import { observer } from 'mobx-react-lite';
import React from 'react';
import DetailView from '../DetailView';
import { useStores } from '../State/Store';
import Register from '../Transactions/Register';
import styles from '../Transactions/Transactions.module.scss';
import { CategoryType } from '../../common/ResponseTypes';

const CategoryDetails: React.FC = observer(() => {
  const {
    uiState: { selectedCategory },
  } = useStores();

  if (!selectedCategory) {
    return null;
  }

  let className = '';
  if (selectedCategory.type === CategoryType.Unassigned) {
    className += styles.unassigned;
  }

  return (
    <DetailView className={className} title={selectedCategory.name}>
      <Register type="category" />
    </DetailView>
  );
});

export default CategoryDetails;

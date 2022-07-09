import { observer } from 'mobx-react-lite';
import React from 'react';
import DetailView from './DetailView';
import { useStores } from './State/mobxStore';

const CategoryDetails: React.FC = observer(() => {
  const {
    uiState: { selectedCategory },
  } = useStores();

  if (!selectedCategory) {
    return null;
  }

  return (
    <DetailView
      detailView="Transactions"
      title={selectedCategory.name}
      type="category"
    />
  );
});

export default CategoryDetails;

import { observer } from 'mobx-react-lite';
import React from 'react';
import DetailView from '../DetailView';
import { useStores } from '../State/mobxStore';
import Register from '../Transactions/Register';

const CategoryDetails: React.FC = observer(() => {
  const {
    uiState: { selectedCategory },
  } = useStores();

  if (!selectedCategory) {
    return null;
  }

  return (
    <DetailView
      title={selectedCategory.name}
    >
      <Register type="category" />
    </DetailView>
  );
});

export default CategoryDetails;

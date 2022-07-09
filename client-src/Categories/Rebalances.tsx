import { observer } from 'mobx-react-lite';
import React from 'react';
import DetailView from '../DetailView';
import Register from '../Transactions/Register';

const Rebalances: React.FC = observer(() => (
  <DetailView
    title="Rebalances"
  >
    <Register type="rebalances" />
  </DetailView>
));

export default Rebalances;

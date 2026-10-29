import React from 'react';
import MoneyCentsAmount from '../MoneyCentsAmount';
import { taxResultCents } from '../State/Taxes/taxResultCents';

const TaxResultAmount: React.FC<{ amount?: number | null }> = ({ amount }) => (
  <MoneyCentsAmount amount={taxResultCents(amount)} />
);

export default TaxResultAmount;

import React from 'react';
import { formatMoneyCents, parseMoneyCents, subtractMoneyCents, type MoneyCents } from '../common/moneyCents';

const zeroCents = parseMoneyCents('0.00');

const MoneyCentsAmount: React.FC<{ amount: MoneyCents; sign?: number; onClick?: () => void }> = ({ amount, sign = 1, onClick }) => {
  const displayed = sign === -1 ? subtractMoneyCents(zeroCents, amount) : amount;
  const className = `${sign === -1 ? 'reverse' : ''} dollar-amount${displayed < 0 ? ' negative' : ''}`;
  const text = formatMoneyCents(displayed).replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,');
  return <div className={className} onClick={onClick}>{text}</div>;
};

export default MoneyCentsAmount;

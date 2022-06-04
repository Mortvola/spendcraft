import React from 'react';
import Amount from '../Amount';

type PropsType = {
  history: { amount: number }[],
}

const CategoryHistory: React.FC<PropsType> = ({
  history,
}) => {
  const renderHistory = () => {
    const list = [];

    history.forEach((h) => {
      list.push((
        <Amount amount={h.amount} />
      ));
    });

    for (let i = list.length; i < 12; i += 1) {
      list.push((<div />));
    }

    return list;
  };

  return (
    <div className="plan-history">
      {renderHistory()}
    </div>
  );
};

export default CategoryHistory;

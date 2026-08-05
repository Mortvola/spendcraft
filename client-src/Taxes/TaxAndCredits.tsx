import React from 'react';
import { observer } from 'mobx-react-lite';
import Amount from '../Amount';
import AmountInput from '../AmountInput';
import Taxes from '../State/Taxes';
import { runInAction } from 'mobx';
import style from './TaxDetails.module.scss';

interface PropsType {
  taxes: Taxes
}

const TaxAndCredits: React.FC<PropsType> = observer(({
  taxes
}) => {
  const handleQualifiedBusinessIncomeDeduction: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    runInAction(() => {
      taxes.qualifiedBusinessIncomeDeduction = parseFloat(event.target.value);
    })
  }

  return (
    <div className={`${style.taxAndCredits} ${style.block}`}>
      <label>
        Total Income:
      </label>
      <Amount amount={taxes.totalIncome} />

      <label>
        Standard Deduction:
      </label>
      <Amount amount={taxes.standardDeduction} />

      <label>
        Qualified Business Income Deduction:
      </label>
      <AmountInput value={taxes.qualifiedBusinessIncomeDeduction} onChange={handleQualifiedBusinessIncomeDeduction} />

      <label>
        Taxable Income:
      </label>
      <Amount amount={taxes.taxableIncome} />
    </div>
  )
})

export default TaxAndCredits;
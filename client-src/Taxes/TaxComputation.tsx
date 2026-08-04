import React from 'react';
import { observer } from 'mobx-react-lite';
import Amount from '../Amount';
import Taxes from '../State/Taxes';
import style from './TaxDetails.module.scss';

interface PropsType {
  taxes: Taxes
}

const TaxComputation: React.FC<PropsType> = observer(({
  taxes,
}) => {
  const taxResults = taxes.run

  return (
    <div className={style.block}>
      <div className={style.brackets}>
        {
          taxResults.brackets.map((t) => (
            <div className={style.recordLayout}>
              <div>{t[0]}%</div>
              <Amount amount={t[1].amount} />
              <Amount amount={t[1].tax} />
            </div>
          ))
        }
      </div>
      <div className={style.summaryRecord}>
        <div>Taxed Amount:</div>
        <Amount amount={taxResults.totalTaxedAmount} />
      </div>
      <div className={style.summaryRecord}>
        <div>Total Taxes:</div>
        <Amount amount={taxResults.totalTaxes} />
      </div>
      <div className={style.summaryRecord}>
        <div>Marginal Tax Rate:</div>
        <Amount amount={taxResults.marginalTaxRate} />
      </div>
      <div className={style.summaryRecord}>
        <div>Effective Tax Rate:</div>
        <Amount amount={taxResults.effectiveTaxRate} />
      </div>
    </div>
  )
})

export default TaxComputation;

import React, { Fragment } from 'react';
import { observer } from 'mobx-react-lite';
import Amount from '../Amount';
import Taxes from '../State/Taxes/Taxes';
import style from './TaxDetails.module.scss';

interface PropsType {
  taxes: Taxes
}

const TaxComputation: React.FC<PropsType> = observer(({
  taxes,
}) => {
  const taxResults = taxes.run

  return (
    <div className={style.computations}>
      Tax Results
      <div className={style.brackets}>
        {
          taxResults.brackets.map((t) => (
            <Fragment key={t[0]}>
              <div>{t[0]}%</div>
              <Amount amount={t[1].amount} />
              <Amount amount={t[1].tax} />
            </Fragment>
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

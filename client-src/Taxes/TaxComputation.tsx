import React, { Fragment } from 'react';
import { observer } from 'mobx-react-lite';
import Amount from '../Amount';
import MoneyCentsAmount from '../MoneyCentsAmount';
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
              <MoneyCentsAmount amount={t[1].amountCents} />
              <MoneyCentsAmount amount={t[1].taxCents} />
            </Fragment>
          ))
        }
      </div>
      <div className={style.summaryRecord}>
        <div>Taxed Amount:</div>
        <MoneyCentsAmount amount={taxResults.totalTaxedAmountCents} />
      </div>
      <div className={style.summaryRecord}>
        <div>Total Taxes:</div>
        <MoneyCentsAmount amount={taxResults.totalTaxesCents} />
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

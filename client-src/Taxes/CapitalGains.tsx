import React from 'react'
import { runInAction } from 'mobx'
import { observer } from 'mobx-react-lite'
import AmountInput from '../AmountInput'
import Taxes from '../State/Taxes/Taxes'
import style from './TaxDetails.module.scss'
import Amount from '../Amount'
import { getCurrentPeriod } from '../State/Taxes/Estimated'

interface PropsType {
  taxes: Taxes
}

const CapitalGains: React.FC<PropsType> = observer(({
  taxes,
}) => {
  const handleShorttermCapitalGains: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    runInAction(() => {
      taxes.income.shortTermCapitalGains = parseFloat(event.target.value);
    })
  }

  const handleLongtermCapitalGains: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    runInAction(() => {
      taxes.income.longTermCapitalGains = parseFloat(event.target.value);
    })
  }

  return (
    <div className={`${style.capitalGains} ${style.block}`}>
      <label>
        Short-term Capital Gains:
      </label>
      <AmountInput value={taxes.income.shortTermCapitalGains} onChange={handleShorttermCapitalGains} />
      <Amount amount={taxes.income.actuals[getCurrentPeriod()].shortTermCapitalGains} />

      <label>
        Long-term Capital Gains:
      </label>
      <AmountInput value={taxes.income.longTermCapitalGains} onChange={handleLongtermCapitalGains} />
      <Amount amount={taxes.income.actuals[getCurrentPeriod()].longTermCapitalGains} />
    </div>
  )
})

export default CapitalGains;

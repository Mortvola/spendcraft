import type { MoneyCents } from '../../common/moneyCents';
import React from 'react'
import { runInAction } from 'mobx'
import { observer } from 'mobx-react-lite'
import TaxAmountInput from './TaxAmountInput'
import Taxes from '../State/Taxes/Taxes'
import style from './TaxDetails.module.scss'
import MoneyCentsAmount from '../MoneyCentsAmount'
import { getCurrentPeriod } from '../State/Taxes/Estimated'

interface PropsType {
  taxes: Taxes
}

const CapitalGains: React.FC<PropsType> = observer(({
  taxes,
}) => {
  const handleShorttermCapitalGains: (value: MoneyCents) => void = (value) => {
    runInAction(() => {
      taxes.income.shortTermCapitalGainsCents = value;
    })
  }

  const handleLongtermCapitalGains: (value: MoneyCents) => void = (value) => {
    runInAction(() => {
      taxes.income.longTermCapitalGainsCents = value;
    })
  }

  return (
    <div className={`${style.capitalGains} ${style.block}`}>
      <label>
        Short-term Capital Gains:
      </label>
      <MoneyCentsAmount amount={taxes.income.actuals[getCurrentPeriod()]
        .shortTermCapitalGainsCents} />
      <TaxAmountInput value={taxes.income.shortTermCapitalGainsCents} onChange={
        handleShorttermCapitalGains} />

      <label>
        Long-term Capital Gains:
      </label>
      <MoneyCentsAmount amount={taxes.income.actuals[getCurrentPeriod()]
        .longTermCapitalGainsCents} />
      <TaxAmountInput value={taxes.income.longTermCapitalGainsCents} onChange={
        handleLongtermCapitalGains} />
    </div>
  )
})

export default CapitalGains;

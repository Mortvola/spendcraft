import Http from '@mortvola/http';
import { DateTime } from 'luxon';
import { observable, runInAction } from 'mobx';
import { ApiError, StatementProps, UpdateStatementProps, TrackingType } from '../../common/ResponseTypes';
import { StatementInterface, StatementsInterface, StatementUpdateValues } from './Types';

import { parseMoneyCents, addMoneyCents, subtractMoneyCents, formatMoneyCents, type MoneyCents } from '../../common/moneyCents';

function decodeStatementTotals(props: Pick<StatementProps, 'credits' | 'debits'>) {
  return {
    creditsCents: parseMoneyCents(props.credits),
    debitsCents: parseMoneyCents(props.debits),
  };
}

function decodeStatementAmounts(props: StatementProps) {
  const income = props.data;
  if (income !== null && income !== undefined && (typeof income !== 'object' || Array.isArray(income))) {
    throw new Error('Invalid statement income response');
  }
  return {
    ...decodeStatementTotals(props),
    startingBalanceCents: parseMoneyCents(props.startingBalance),
    endingBalanceCents: parseMoneyCents(props.endingBalance),
    shortTermGainsCents: income?.shortTermCapitalGains == null ? parseMoneyCents('0.00') : parseMoneyCents(income.shortTermCapitalGains),
    longTermGainsCents: income?.longTermCapitalGains == null ? parseMoneyCents('0.00') : parseMoneyCents(income.longTermCapitalGains),
    dividendsCents: income?.dividends == null ? parseMoneyCents('0.00') : parseMoneyCents(income.dividends),
    taxableInterestCents: income?.taxableInterest == null ? parseMoneyCents('0.00') : parseMoneyCents(income.taxableInterest),
  };
}

class Statement implements StatementInterface {
  @observable
  accessor id: number;

  @observable
  accessor startDate: DateTime

  @observable
  accessor endDate: DateTime

  @observable
  accessor startingBalanceCents: MoneyCents

  @observable
  accessor endingBalanceCents: MoneyCents

  @observable
  accessor creditsCents: MoneyCents

  @observable
  accessor debitsCents: MoneyCents

  get calculatedEndingBalanceCents(): MoneyCents {
    return addMoneyCents(this.startingBalanceCents, this.creditsCents, this.debitsCents);
  }

  get reconciliationDifferenceCents(): MoneyCents {
    return subtractMoneyCents(this.calculatedEndingBalanceCents, this.endingBalanceCents);
  }

  @observable
  accessor shortTermGainsCents: MoneyCents

  @observable
  accessor longTermGainsCents: MoneyCents

  @observable
  accessor dividendsCents: MoneyCents

  @observable
  accessor taxableInterestCents: MoneyCents

  statements: StatementsInterface

  constructor(
    props: StatementProps,
    statements: StatementsInterface,
  ) {
    const amounts = decodeStatementAmounts(props);
    this.id = props.id
    this.startDate = DateTime.fromISO(props.startDate)
    this.endDate = DateTime.fromISO(props.endDate)

    this.startingBalanceCents = amounts.startingBalanceCents
    this.endingBalanceCents = amounts.endingBalanceCents
    this.creditsCents = amounts.creditsCents
    this.debitsCents = amounts.debitsCents

    this.shortTermGainsCents = amounts.shortTermGainsCents
    this.longTermGainsCents = amounts.longTermGainsCents
    this.dividendsCents = amounts.dividendsCents
    this.taxableInterestCents = amounts.taxableInterestCents

    this.statements = statements
  }

  apply(props: StatementProps): void {
    const amounts = decodeStatementAmounts(props);
    if (props.id !== this.id || !DateTime.fromISO(props.startDate).isValid
      || !DateTime.fromISO(props.endDate).isValid) {
      throw new Error('Invalid statement response');
    }
    runInAction(() => {
      this.startingBalanceCents = amounts.startingBalanceCents;
      this.endingBalanceCents = amounts.endingBalanceCents;
      this.creditsCents = amounts.creditsCents;
      this.debitsCents = amounts.debitsCents;

      this.startDate = DateTime.fromISO(props.startDate);
      this.endDate = DateTime.fromISO(props.endDate);

      this.shortTermGainsCents = amounts.shortTermGainsCents
      this.longTermGainsCents = amounts.longTermGainsCents
      this.dividendsCents = amounts.dividendsCents
      this.taxableInterestCents = amounts.taxableInterestCents
    })
  }

  applyTotals(props: Pick<StatementProps, 'credits' | 'debits'>): void {
    const amounts = decodeStatementTotals(props);
    runInAction(() => {

      this.creditsCents = amounts.creditsCents;
      this.debitsCents = amounts.debitsCents;
    });
  }

  async update(update: StatementUpdateValues): Promise<ApiError[] | null> {
    const { startingBalanceCents, endingBalanceCents, creditsCents, debitsCents, ...values } = update;
    const payload: UpdateStatementProps = {
      ...values,
      startingBalance: startingBalanceCents === undefined ? undefined : formatMoneyCents(startingBalanceCents),
      endingBalance: endingBalanceCents === undefined ? undefined : formatMoneyCents(endingBalanceCents),
      credits: creditsCents === undefined ? undefined : formatMoneyCents(creditsCents),
      debits: debitsCents === undefined ? undefined : formatMoneyCents(debitsCents),
      data: update.data === undefined ? undefined : {
        shortTermCapitalGains: formatMoneyCents(update.data.shortTermCapitalGainsCents),
        longTermCapitalGains: formatMoneyCents(update.data.longTermCapitalGainsCents),
        dividends: formatMoneyCents(update.data.dividendsCents),
        taxableInterest: formatMoneyCents(update.data.taxableInterestCents),
      },
    };
    const response = await Http.patch<UpdateStatementProps, StatementProps>(`/api/v1/statements/${this.id}`, payload)

    if (response.ok) {
      const props = await response.body()

      this.apply(props);
      runInAction(() => {
        this.statements.statements.sort((a, b) => b.endDate.toMillis() - a.endDate.toMillis());
      });
      if (update.reconcile !== undefined) {
        await this.statements.store.register.refreshReconciliation(this.statements.account.id);
      }
      if (this.statements.account.tracking === TrackingType.Balances) {
        await this.statements.store.accounts.load();
      }
    }

    return null;
  }

  async delete(): Promise<null | ApiError[]> {
    const response = await Http.delete(`/api/v1/statements/${this.id}`)

    if (response.ok) {
      runInAction(() => {
        this.statements.removeStatement(this.id);
        if (this.statements.store.uiState.selectedStatement === this) {
          this.statements.store.uiState.selectStatement(null);
        }
      });
      await this.statements.store.register.refreshReconciliation(this.statements.account.id);
      if (this.statements.account.tracking === TrackingType.Balances) {
        await this.statements.store.accounts.load();
      }
    } else {
      throw new Error('Statement deletion failed');
    }

    return null;
  }  
}

export default Statement;

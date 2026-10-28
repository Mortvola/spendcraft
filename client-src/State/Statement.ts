import Http from '@mortvola/http';
import { DateTime } from 'luxon';
import { observable, runInAction } from 'mobx';
import { ApiError, StatementProps, UpdateStatementProps, TrackingType } from '../../common/ResponseTypes';
import { StatementInterface, StatementsInterface, StatementUpdateValues } from './Types';

import { decodeAmount, encodeAmount } from '../monetary';
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
    shortTermGains: income?.shortTermCapitalGains == null ? 0 : decodeAmount(income.shortTermCapitalGains),
    longTermGains: income?.longTermCapitalGains == null ? 0 : decodeAmount(income.longTermCapitalGains),
    dividends: income?.dividends == null ? 0 : decodeAmount(income.dividends),
    taxableInterest: income?.taxableInterest == null ? 0 : decodeAmount(income.taxableInterest),
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
  accessor shortTermGains: number

  @observable
  accessor longTermGains: number

  @observable
  accessor dividends: number

  @observable
  accessor taxableInterest: number

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

    this.shortTermGains = amounts.shortTermGains
    this.longTermGains = amounts.longTermGains
    this.dividends = amounts.dividends
    this.taxableInterest = amounts.taxableInterest

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

      this.shortTermGains = amounts.shortTermGains
      this.longTermGains = amounts.longTermGains
      this.dividends = amounts.dividends
      this.taxableInterest = amounts.taxableInterest
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
        shortTermCapitalGains: encodeAmount(update.data.shortTermCapitalGains),
        longTermCapitalGains: encodeAmount(update.data.longTermCapitalGains),
        dividends: encodeAmount(update.data.dividends),
        taxableInterest: encodeAmount(update.data.taxableInterest),
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
